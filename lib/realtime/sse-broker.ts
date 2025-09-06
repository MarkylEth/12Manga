// lib/realtime/sse-broker.ts
type Client = {
  userId: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  controller: AbortController;
  connectedAt: number;
};

type TypingUser = {
  userId: string;
  lastTyped: number;
};

const channels = new Map<number, Set<Client>>();
const typingUsers = new Map<number, Map<string, TypingUser>>();
const enc = new TextEncoder();

// Очистка старых typing indicators каждые 30 секунд
setInterval(() => {
  const now = Date.now();
  const TYPING_TIMEOUT = 5000;

  for (const [chatId, userMap] of typingUsers.entries()) {
    for (const [userId, typingInfo] of userMap.entries()) {
      if (now - typingInfo.lastTyped > TYPING_TIMEOUT) {
        userMap.delete(userId);
        broadcast(chatId, 'typing:stop', { userId }, userId);
      }
    }
    if (userMap.size === 0) {
      typingUsers.delete(chatId);
    }
  }
}, 30000);

// Очистка старых подключений каждую минуту
setInterval(() => {
  const now = Date.now();
  const CONNECTION_TIMEOUT = 1000 * 60 * 30; // 30 минут

  for (const [chatId, clients] of channels.entries()) {
    const toRemove: Client[] = [];

    for (const client of clients) {
      if (now - client.connectedAt > CONNECTION_TIMEOUT) {
        toRemove.push(client);
      }
    }

    toRemove.forEach(client => {
      client.controller.abort();
      clients.delete(client);
    });

    if (clients.size === 0) {
      channels.delete(chatId);
    }
  }
}, 60000);

async function writeToClient(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: string,
  data: any
): Promise<boolean> {
  try {
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(enc.encode(line));
    return true;
  } catch (error) {
    console.warn('Failed to write to SSE client:', error);
    return false;
  }
}

export function addClient(chatId: number, userId: string) {
  const controller = new AbortController();
  const ts = new TransformStream<Uint8Array, Uint8Array>();
  const writer = ts.writable.getWriter();

  let clientSet = channels.get(chatId);
  if (!clientSet) {
    clientSet = new Set<Client>();
    channels.set(chatId, clientSet);
  }

  const client: Client = {
    userId,
    writer,
    controller,
    connectedAt: Date.now(),
  };

  clientSet.add(client);

  writeToClient(writer, 'connected', {
    ok: true,
    chatId,
    userId,
    timestamp: Date.now(),
  });

  // Отправить текущих печатающих пользователей
  const currentTyping = typingUsers.get(chatId);
  if (currentTyping && currentTyping.size > 0) {
    const activeTypers = Array.from(currentTyping.entries())
      .filter(([uid]) => uid !== userId)
      .map(([uid, info]) => ({ userId: uid, lastTyped: info.lastTyped }));

    if (activeTypers.length > 0) {
      writeToClient(writer, 'typing:current', { users: activeTypers });
    }
  }

  function cleanup() {
    try {
      writer.close();
    } catch {}

    clientSet?.delete(client);
    if (clientSet && clientSet.size === 0) {
      channels.delete(chatId);
    }

    // Удалить из typing если печатал
    const typingMap = typingUsers.get(chatId);
    if (typingMap?.has(userId)) {
      typingMap.delete(userId);
      broadcast(chatId, 'typing:stop', { userId }, userId);
      if (typingMap.size === 0) {
        typingUsers.delete(chatId);
      }
    }

    controller.abort();
  }

  controller.signal.addEventListener('abort', cleanup);

  return {
    stream: ts.readable,
    close: cleanup,
    clientId: `${chatId}-${userId}-${Date.now()}`,
  };
}

export function broadcast(
  chatId: number,
  event: string,
  payload: any,
  excludeUserId?: string
) {
  const clientSet = channels.get(chatId);
  if (!clientSet || clientSet.size === 0) return;

  const message = `event: ${event}\ndata: ${JSON.stringify({
    ...payload,
    timestamp: Date.now(),
  })}\n\n`;

  const messageBuffer = enc.encode(message);
  const clientsToRemove: Client[] = [];

  for (const client of clientSet) {
    if (excludeUserId && client.userId === excludeUserId) {
      continue;
    }
    client.writer.write(messageBuffer).catch(() => {
      clientsToRemove.push(client);
    });
  }

  // Очистка неудачных клиентов
  clientsToRemove.forEach(client => {
    client.controller.abort();
    clientSet.delete(client);
  });
}

export const pushNewMessage = (chatId: number, message: any) => {
  broadcast(chatId, 'message:new', message);
};

export const pushTyping = (chatId: number, userId: string) => {
  let userMap = typingUsers.get(chatId);
  if (!userMap) {
    userMap = new Map();
    typingUsers.set(chatId, userMap);
  }

  const wasTyping = userMap.has(userId);
  userMap.set(userId, {
    userId,
    lastTyped: Date.now(),
  });

  if (!wasTyping) {
    broadcast(chatId, 'typing:start', { userId }, userId);
  }
};

export const pushRead = (chatId: number, userId: string, lastId: number) => {
  broadcast(chatId, 'read', { userId, lastId });
};

/* === добавлено для реакций и закрепа === */
export const pushReaction = (
  chatId: number,
  payload: { message_id: number; counts: { emoji: string; count: number }[]; mine: string[] }
) => {
  broadcast(chatId, 'message:react', payload);
};

export const pushPin = (
  chatId: number,
  payload: { message_id: number | null; action: 'pin' | 'unpin' }
) => {
  broadcast(chatId, 'message:pin', payload);
};

// src/lib/http.ts
export async function fetchJSON<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text(); // читаем как текст, чтобы не падать
  try {
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = (json && (json.error || json.message)) || res.statusText || 'Request failed';
      throw new Error(`${msg} (HTTP ${res.status})`);
    }
    return json as T;
  } catch (e) {
    // Тело не JSON — вернём инфу, чтобы не сыпалось "Unexpected end of JSON input"
    if (!res.ok) {
      throw new Error(`Bad JSON (HTTP ${res.status}). Body: ${text?.slice(0, 300) || '<empty>'}`);
    }
    throw new Error(`Bad JSON. Body: ${text?.slice(0, 300) || '<empty>'}`);
  }
}

if (op === 'insert') {
  const arr = Array.isArray(body.values) ? body.values : body.values ? [body.values] : [];
  if (!arr.length) throw new Error('values required');

  const rawCols = Object.keys(arr[0]);        // сырые ключи объекта
  const colsSql = rawCols.map(ident);         // те же, но как SQL идентификаторы

  const values: any[] = [];
  const tuples = arr.map((row) => {
    const placeholders = rawCols.map((_c, cIdx) => {
      values.push((row as any)[rawCols[cIdx]]);
      return `$${values.length}`;
    });
    return `(${placeholders.join(',')})`;
  });

  const q = `INSERT INTO ${t} (${colsSql.join(',')}) VALUES ${tuples.join(',')}
             RETURNING *`;
  const rows = await sql(q, values);
  return NextResponse.json({ data: Array.isArray(body.values) ? rows : rows[0] });
}

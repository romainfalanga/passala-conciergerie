// Découpe un fichier SQL en instructions, en gardant les corps de TRIGGER (BEGIN … END;) intacts.
export function splitSql(sql) {
  const statements = [];
  let current = [], inBlock = false;
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/^\s*--.*$/, '');
    if (!line.trim()) continue;
    current.push(line);
    if (/\bBEGIN\s*$/.test(line.trim())) inBlock = true;
    const end = inBlock ? /^END;\s*$/.test(line.trim()) : /;\s*$/.test(line);
    if (end) {
      statements.push(current.join('\n').trim().replace(/;$/, ''));
      current = []; inBlock = false;
    }
  }
  if (current.join('').trim()) statements.push(current.join('\n').trim());
  return statements;
}

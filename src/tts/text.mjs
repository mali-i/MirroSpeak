// Shared by main and renderer so IPC identifies a saved paragraph, never arbitrary text.
export function readingChunks(report, topic = null) {
  if (topic !== null && (!Number.isInteger(topic) || !report?.notes?.[topic])) throw new Error('朗读主题不存在。');
  const blocks = topic === null
    ? [{ text: [report.title, report.summary].filter(Boolean).join('。'), topic: null }, ...report.notes.map((note, index) => ({ text: [note.title, note.takeaway, note.text].filter(Boolean).join('。'), topic: index }))]
    : [{ text: [report.notes[topic].title, report.notes[topic].takeaway, report.notes[topic].text].filter(Boolean).join('。'), topic }];
  return blocks.flatMap(block => {
    const text = block.text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/<[^>]*>/g, '').replace(/^[\s#>*-]+/gm, '').replace(/[`*_~]/g, '').trim();
    const chunks = []; let current = '';
    for (const sentence of text.match(/[^。！？!?\n]+[。！？!?\n]*/gu) || []) {
      const points = Array.from(sentence);
      while (points.length) {
        const part = points.splice(0, 240).join('');
        if (Array.from(current + part).length > 240) { if (current.trim()) chunks.push({ text: current.trim(), topic: block.topic }); current = ''; }
        current += part;
      }
    }
    if (current.trim()) chunks.push({ text: current.trim(), topic: block.topic });
    return chunks;
  });
}

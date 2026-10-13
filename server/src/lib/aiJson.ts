/**
 * 宽容解析模型输出的 JSON —— 对应 PRD §8.4。
 * 模型常将 JSON 包裹在 ```json 代码块或说明文字中；先直接解析，
 * 失败则截取「首个 { 至末个 }」再试一次。
 */
export function parseModelJson<T>(raw: string, validate: (value: unknown) => T): T {
  const candidates: string[] = [raw]
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1))

  let lastError: unknown
  for (const text of candidates) {
    try {
      return validate(JSON.parse(text))
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('模型返回内容不是合法 JSON')
}
// mammoth 未提供自带类型声明，且官方 @types/mammoth 不存在，此处按实际使用面声明
declare module 'mammoth' {
  export interface ExtractResult {
    value: string
    messages: unknown[]
  }

  export function extractRawText(input: { buffer: Buffer }): Promise<ExtractResult>
}
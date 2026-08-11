// 极简 CSV 工具（RFC4180 子集，零依赖）：管理端导入导出用
// - parseCsv：处理引号包裹、逗号、换行、\r\n/\r、UTF-8 BOM
// - toCsv：RFC4180 序列化（含逗号/引号/换行的字段用双引号包裹并转义），统一 \r\n 行尾

/** 解析 CSV 文本为二维数组（不跳过空行；BOM 自动剥离） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0
  // 剥离 UTF-8 BOM（Excel 导出的 CSV 常带  前缀）
  if (text.charCodeAt(0) === 0xfeff) i = 1
  while (i < text.length) {
    const ch = text.charAt(i)
    if (inQuotes) {
      if (ch === '"') {
        // 引号成对 = 转义引号
        if (text.charAt(i + 1) === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else {
        field += ch
        i += 1
      }
    } else if (ch === '"') {
      inQuotes = true
      i += 1
    } else if (ch === ",") {
      row.push(field)
      field = ""
      i += 1
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i += 1
    } else if (ch === "\r") {
      // \r\n 或独立 \r 均视为行结束
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i += text.charAt(i + 1) === "\n" ? 2 : 1
    } else {
      field += ch
      i += 1
    }
  }
  // 无尾换行时的最后一个字段/空行
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** 序列化二维数组为 CSV 文本（RFC4180：含 [",\n\r] 的字段加双引号并转义） */
export function toCsv(rows: string[][]): string {
  const lines = rows.map((row) =>
    row
      .map((field) => (/[",\n\r]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field))
      .join(","),
  )
  return lines.join("\r\n") + "\r\n"
}

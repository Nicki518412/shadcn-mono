import { describe, expect, it } from "vitest"
import { parseCsv, toCsv } from "../src/lib/csv.js"

describe("parseCsv", () => {
  it("基础解析：字段/行拆分，忽略末尾换行", () => {
    expect(parseCsv("a,b,c\r\nd,e,f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ])
  })

  it("引号包裹字段：内含逗号/引号/换行", () => {
    expect(parseCsv('a,"b,c","say ""hi""",d')).toEqual([["a", "b,c", 'say "hi"', "d"]])
    expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]])
  })

  it("剥离 UTF-8 BOM（Excel 导出常见）", () => {
    expect(parseCsv("﻿a,b")).toEqual([["a", "b"]])
  })

  it("空行保留为空行数组（导入侧按空行跳过）", () => {
    expect(parseCsv("a,b\n\nc,d")).toEqual([
      ["a", "b"],
      [""],
      ["c", "d"],
    ])
  })

  it("独立 \\r 视为行结束（老 Mac 格式）", () => {
    expect(parseCsv("a,b\rc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })
})

describe("toCsv", () => {
  it("普通字段原样输出，\\r\\n 行尾", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d\r\n")
  })

  it("含逗号/引号/换行的字段加引号并转义", () => {
    expect(toCsv([["a,b", 'say "hi"', "l1\nl2"]])).toBe('"a,b","say ""hi""","l1\nl2"\r\n')
  })

  it("parse 与 toCsv 往返一致（RFC4180 转义闭环）", () => {
    const rows = [['a,b', "c\"d", "e\nf", "g"], ["", "h"]]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

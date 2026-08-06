import { useEffect, useState } from "react"

/**
 * 分页状态 hook：page/pageSize/totalPages + 页码钳制。
 * totalPages 变小（如删除末页最后一条后分页数回落）且 page 越界时，
 * 自动回钳到 totalPages，触发列表按新页码重新查询，避免停留在空页。
 * 调用方负责在数据就绪后 setTotalPages(ceil(total / pageSize))。
 */
export function usePagination(initialPage = 1, initialPageSize = 10) {
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    if (page > totalPages && totalPages >= 1) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  return { page, pageSize, totalPages, setPage, setPageSize, setTotalPages }
}

// Generate sequential ticket ID: SR-YYYYMM-001
export const generateTicketId = (year: number, month: number) => {
  return `SR-${year}${String(month).padStart(2, '0')}-XXX`; // Replace XXX with seq later via aggregation
};

// Calculate SLA breach
export const calcSLAStatus = (createdAt: string | Date, targetDays = 3) => {
  const createdAtMs = new Date(createdAt).getTime();
  const daysElapsed = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
  return daysElapsed > targetDays ? 'BREACHED' : 'OK';
};

// Pagination helper
export const getPagination = (page: number | string = 1, limit: number | string = 20) => {
  const pageNum = typeof page === 'number' ? page : Number.parseInt(String(page || ''), 10);
  const limitNum = typeof limit === 'number' ? limit : Number.parseInt(String(limit || ''), 10);

  const safePage = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 20;

  const skip = (safePage - 1) * safeLimit;
  return { skip, limit: safeLimit };
};

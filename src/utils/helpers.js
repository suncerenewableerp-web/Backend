// Generate sequential ticket ID: SR-YYYYMM-001
const generateTicketId = (year, month) => {
  return `SR-${year}${String(month).padStart(2, '0')}-XXX`; // Replace XXX with seq later via aggregation
};

// Calculate SLA breach
const calcSLAStatus = (createdAt, targetDays = 3) => {
  const daysElapsed = (new Date() - new Date(createdAt)) / (1000 * 60 * 60 * 24);
  return daysElapsed > targetDays ? 'BREACHED' : 'OK';
};

// Pagination helper
const getPagination = (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return { skip, limit: parseInt(limit) };
};

module.exports = { generateTicketId, calcSLAStatus, getPagination };


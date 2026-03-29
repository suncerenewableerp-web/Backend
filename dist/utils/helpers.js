"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPagination = exports.calcSLAStatus = exports.generateTicketId = void 0;
// Generate sequential ticket ID: SR-YYYYMM-001
const generateTicketId = (year, month) => {
    return `SR-${year}${String(month).padStart(2, '0')}-XXX`; // Replace XXX with seq later via aggregation
};
exports.generateTicketId = generateTicketId;
// Calculate SLA breach
const calcSLAStatus = (createdAt, targetDays = 3) => {
    const createdAtMs = new Date(createdAt).getTime();
    const daysElapsed = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
    return daysElapsed > targetDays ? 'BREACHED' : 'OK';
};
exports.calcSLAStatus = calcSLAStatus;
// Pagination helper
const getPagination = (page = 1, limit = 20) => {
    const pageNum = typeof page === 'number' ? page : Number.parseInt(String(page || ''), 10);
    const limitNum = typeof limit === 'number' ? limit : Number.parseInt(String(limit || ''), 10);
    const safePage = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
    const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 20;
    const skip = (safePage - 1) * safeLimit;
    return { skip, limit: safeLimit };
};
exports.getPagination = getPagination;

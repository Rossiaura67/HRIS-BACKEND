"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const morgan_1 = __importDefault(require("morgan"));
const helmet_1 = __importDefault(require("helmet"));
require('dotenv').config();
// Import Routes Lama
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const attendance_routes_1 = __importDefault(require("./routes/attendance.routes"));
const leave_routes_1 = __importDefault(require("./routes/leave.routes"));
const position_routes_1 = __importDefault(require("./routes/position.routes"));
const payroll_routes_1 = __importDefault(require("./routes/payroll.routes"));
const company_routes_1 = __importDefault(require("./routes/company.routes"));
const superadmin_routes_1 = __importDefault(require("./routes/superadmin.routes"));
const subscription_routes_1 = __importDefault(require("./routes/subscription.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
const app = (0, express_1.default)();
// ============================================================
// 1. SECURITY & GLOBAL MIDDLEWARE
// ============================================================
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: false,
}));
const corsOptions = {
    origin: process.env.CLIENT_URL || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
};
app.use((0, cors_1.default)({
    origin: "http://localhost:3000",
    credentials: true
}));
app.use((0, morgan_1.default)("dev"));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/public", express_1.default.static(path_1.default.join(process.cwd(), "public")));
// ============================================================
// 2. AUTO-CREATE STORAGE FOLDERS
// ============================================================
const folders = ["public/profiles", "public/logos", "public/attendance", "public/leaves"];
folders.forEach(folder => {
    const fullPath = path_1.default.join(process.cwd(), folder);
    if (!fs_1.default.existsSync(fullPath))
        fs_1.default.mkdirSync(fullPath, { recursive: true });
});
// ============================================================
// 3. REGISTRASI RUTE API
// ============================================================
app.use("/api/auth", auth_routes_1.default);
app.use("/api/dashboard", dashboard_routes_1.default);
app.use("/api/users", user_routes_1.default);
app.use("/api/attendance", attendance_routes_1.default);
app.use("/api/leaves", leave_routes_1.default);
app.use("/api/payroll", payroll_routes_1.default);
app.use("/api/positions", position_routes_1.default);
app.use("/api/company", company_routes_1.default);
app.use("/api/superadmin", superadmin_routes_1.default);
app.use("/api/subscription", subscription_routes_1.default);
app.use("/api/audit", audit_routes_1.default);
app.get("/", (req, res) => {
    res.json({
        status: "success",
        message: "HRIS SaaS API is running 🚀",
        version: "1.0.0"
    });
});
// ============================================================
// 4. ERROR HANDLING
// ============================================================
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" });
});
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[Error] ${req.method} ${req.url} => ${message}`);
    res.status(status).json({ success: false, message });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    ################################################
    🚀  Server HRIS berjalan di port ${PORT}
    🌐  API Base URL: http://localhost:${PORT}/api
    📁  Static URL: http://localhost:${PORT}/public
    ################################################
    `);
});

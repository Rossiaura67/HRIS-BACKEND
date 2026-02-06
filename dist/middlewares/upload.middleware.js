"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLeave = exports.uploadAttendance = exports.uploadLogo = exports.uploadProfile = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        let subFolder = "others";
        if (file.fieldname === "profile_image") {
            subFolder = "profiles";
        }
        else if (file.fieldname === "logo") {
            subFolder = "logos";
        }
        else if (file.fieldname === "evidence") {
            subFolder = "leaves";
        }
        else if (file.fieldname === "attendance_photo") {
            subFolder = "attendance";
        }
        else if (file.fieldname === "proofOfPayment") {
            subFolder = "receipts";
        }
        const fullPath = path_1.default.join(process.cwd(), "public", subFolder);
        if (!fs_1.default.existsSync(fullPath)) {
            fs_1.default.mkdirSync(fullPath, { recursive: true });
        }
        cb(null, fullPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path_1.default.extname(file.originalname)}`);
    }
});
exports.upload = (0, multer_1.default)({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|pdf/;
        const extname = fileTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Format file tidak didukung! Gunakan JPG, PNG, atau PDF."));
    }
});
exports.uploadProfile = exports.upload;
exports.uploadLogo = exports.upload;
exports.uploadAttendance = exports.upload;
exports.uploadLeave = exports.upload;
exports.default = exports.upload;

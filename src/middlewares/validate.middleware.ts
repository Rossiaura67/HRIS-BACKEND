import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export const validate = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validasi data gagal",
            errors: errors.array().map(err => ({
                field: err.type === 'field' ? err.path : '',
                message: err.msg
            }))
        });
    }
    next();
};
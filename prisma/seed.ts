import dotenv from "dotenv";
import { PrismaClient, Role, UserStatus, SubscriptionStatus, ContractType, AttendanceStatus, PayrollStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Memulai proses seeding final... 🌱");

  // 1. Membersihkan Database dengan urutan yang benar (FK Safe)
  await prisma.attendance.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.positionSalary.deleteMany();
  await prisma.officeSetting.deleteMany();
  await prisma.attendanceSetting.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.company.deleteMany();
  await prisma.masterPlan.deleteMany();

  const salt = await bcrypt.genSalt(10);
  const commonPassword = await bcrypt.hash("123456", salt);

  // 2. Membuat Master Plans (Produk SaaS)
  console.log("Membuat Master Plans...");
  const plans = [
    { name: "Demo Plan", price: 0, maxEmployees: 10, duration: 14 },
    { name: "Enterprise", price: 2500000, maxEmployees: 50, duration: 30 },
    { name: "Premium Unlimited", price: 5000000, maxEmployees: 100, duration: 30 }
  ];

  const masterPlans = await Promise.all(
    plans.map(p => prisma.masterPlan.create({
      data: {
        name: p.name,
        price: p.price,
        maxEmployees: p.maxEmployees,
        durationDays: p.duration,
        description: `Paket ${p.name} terbaik untuk skala bisnis Anda.`
      }
    }))
  );

  // 3. Membuat Superadmin (System Root)
  console.log("Membuat Superadmin...");
  const superadmin = await prisma.user.create({
    data: {
      name: "Intan Tania",
      email: "admin@supersuper",
      password: commonPassword,
      role: Role.superadmin,
      status: UserStatus.Active,
      is_verified: true,
    }
  });

  // 4. Membuat 3 Perusahaan (Tenants)
  const companyTemplates = [
    { name: "Startup Nusantara", plan: masterPlans[1] }, // Enterprise
    { name: "PT Demo Indonesia", plan: masterPlans[0] }, // Demo
    { name: "PT. Demo Teknologi Indonesia", plan: masterPlans[2] } // Premium
  ];

  for (const template of companyTemplates) {
    console.log(`Inisialisasi tenant: ${template.name}`);

    // Create Company
    const company = await prisma.company.create({
      data: {
        name: template.name,
        status: UserStatus.Active,
        address: `Gedung ${template.name} Lt. 5, Jakarta`
      }
    });

    // Create Subscription & Transaction (Jika berbayar)
    const subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        planName: template.plan.name,
        status: SubscriptionStatus.Active,
        endDate: new Date(Date.now() + template.plan.durationDays * 24 * 60 * 60 * 1000),
        maxEmployees: template.plan.maxEmployees,
        price: template.plan.price
      }
    });

if (Number(template.plan.price) > 0) {
        await prisma.transaction.create({
        data: {
          companyId: company.id,
          planId: template.plan.id,
          referenceId: `REF-${Date.now()}-${company.id}`,
          planName: template.plan.name,
          amount: template.plan.price,
          status: "Success",
          invoiceId: `INV/${new Date().getFullYear()}/${company.id}/${Math.floor(1000 + Math.random() * 9000)}`,
          maxEmployeesSnapshot: template.plan.maxEmployees,
          durationSnapshot: template.plan.durationDays,
          paidAt: new Date()
        }
      });
    }

    // Create Office & Attendance Settings (Geofencing)
    await prisma.officeSetting.create({
      data: {
        companyId: company.id,
        officeName: "Head Office",
        latitude: -6.200000,
        longitude: 106.816666,
        radius: 100
      }
    });

    await prisma.attendanceSetting.create({
      data: { companyId: company.id, name: "clockInTime", value: "08:00" }
    });

    // Create Position & Salary
    const position = await prisma.positionSalary.create({
      data: {
        companyId: company.id,
        positionName: "General Staff",
        baseSalary: 6000000,
        mealAllowance: 25000,
        transportAllowance: 20000,
        lateDeductionPerMin: 2000
      }
    });

    // 5. Membuat Admin Perusahaan
    await prisma.user.create({
      data: {
        companyId: company.id,
        name: `Admin ${template.name}`,
        email: `admin@${template.name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
        password: commonPassword,
        role: Role.admin,
        status: UserStatus.Active,
        is_verified: true,
        employeeId: `ADM-${company.id}`
      }
    });

    // 6. Membuat 5 Karyawan per Perusahaan & Data Absensi
    console.log(`Membuat 5 karyawan untuk ${template.name}...`);
    for (let i = 1; i <= 5; i++) {
      const employee = await prisma.user.create({
        data: {
          companyId: company.id,
          name: `Employee ${i} ${template.name}`,
          email: `emp${i}@${template.name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
          password: commonPassword,
          role: Role.employee,
          status: UserStatus.Active,
          is_verified: true,
          positionId: position.id,
          employeeId: `EMP-${company.id}-0${i}`,
          contract_type: ContractType.Tetap
        }
      });

      // Seeding Absensi (Gado-gado: Ontime, Late, Absent)
      await prisma.attendance.create({
        data: {
          userId: employee.id,
          date: new Date(),
          status: i % 3 === 0 ? "Late" : "OnTime",
          clockIn: new Date(new Date().setHours(8, i % 3 === 0 ? 15 : 0)),
          tipeAbsensi: "WFO",
          isLate: i % 3 === 0,
          lateDuration: i % 3 === 0 ? 15 : 0
        }
      });

      // Tambahkan Audit Log awal
      await prisma.auditLog.create({
        data: {
          companyId: company.id,
          userId: employee.id,
          action: "USER_REGISTER",
          details: `Pendaftaran karyawan baru atas nama ${employee.name}`
        }
      });
    }
  }

  console.log("Seeding Final Selesai! 🌳");
}

main()
  .catch((e) => {
    console.error("Seeding Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
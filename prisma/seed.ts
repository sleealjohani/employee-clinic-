/**
 * Seeds a usable starting point: one administrator plus a small, realistic
 * demo cohort so every screen has something to show.
 *
 * Safe to run more than once — it is a no-op once users exist. Set
 * SEED_DEMO_DATA=false to create only the administrator account.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe2026!";
const WITH_DEMO = process.env.SEED_DEMO_DATA !== "false";

const DEPARTMENTS = ["التمريض", "المختبر", "الأشعة", "الطوارئ", "الإدارة", "التغذية", "الصيدلية"];
const JOB_TITLES = ["ممرض", "فني مختبر", "فني أشعة", "طبيب مقيم", "إداري", "أخصائي تغذية", "صيدلي"];

/** Builds a valid Saudi national ID (Luhn-style check digit) so demo data passes validation. */
function makeNationalId(seed: number): string {
  const body = `1${String(200000000 + seed * 137).slice(0, 8)}`;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = Number(body[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  return body + String((10 - (sum % 10)) % 10);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Users already exist — seed skipped.");
    return;
  }

  const admin = await db.user.create({
    data: {
      username: ADMIN_USERNAME,
      name: "مسؤول عيادة الموظف",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      mustChangePassword: true,
    },
  });
  console.log(`Administrator created: ${admin.username} (password change required at first sign-in)`);

  await db.user.create({
    data: {
      username: "nurse",
      name: "ممرض العيادة",
      role: "STAFF",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      mustChangePassword: true,
    },
  });

  if (!WITH_DEMO) return;

  const firstNames = ["محمد", "عبدالله", "سارة", "نورة", "خالد", "فهد", "ريم", "مها", "سلطان", "أحمد", "لطيفة", "بندر"];
  const lastNames = ["العنزي", "الشمري", "الرويلي", "الحربي", "القحطاني", "المطيري", "السهلي", "الدوسري"];

  for (let i = 0; i < 24; i++) {
    const female = i % 3 === 0;
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    const employee = await db.employee.create({
      data: {
        nationalId: makeNationalId(i + 1),
        name,
        gender: female ? "FEMALE" : "MALE",
        dob: new Date(1985 + (i % 15), i % 12, ((i * 7) % 27) + 1),
        phone: `05${String(10000000 + i * 3571).slice(0, 8)}`,
        employeeNo: `EMP${String(1001 + i)}`,
        department: DEPARTMENTS[i % DEPARTMENTS.length],
        jobTitle: JOB_TITLES[i % JOB_TITLES.length],
        hireDate: daysAgo(400 + i * 23),
        // Two records are left deliberately incomplete so the dashboard has something to flag.
        bloodType: i % 8 === 0 ? null : ["O+", "A+", "B+", "AB+", "O-", "A-"][i % 6],
        chronicConditions: i % 7 === 0 ? ["السكري النوع الثاني"] : [],
        currentMedications: i % 7 === 0 ? ["ميتفورمين 500 ملغ"] : [],
        createdById: admin.id,
      },
    });

    await db.employmentHistory.create({
      data: {
        employeeId: employee.id,
        department: employee.department,
        jobTitle: employee.jobTitle,
        employeeNo: employee.employeeNo,
        status: "ACTIVE",
      },
    });

    // --- visits
    for (let v = 0; v < (i % 4); v++) {
      await db.visit.create({
        data: {
          employeeId: employee.id,
          visitDate: daysAgo(v * 21 + (i % 9)),
          type: v === 0 ? "ACUTE_CARE" : v === 1 ? "PERIODIC" : "FOLLOW_UP",
          chiefComplaint: ["صداع", "ألم أسفل الظهر", "سعال", "فحص دوري"][v % 4],
          diagnosis: ["توتر عضلي", "التهاب الجهاز التنفسي العلوي", "لا يوجد", "متابعة"][v % 4],
          plan: "راحة ومسكن، مراجعة عند اللزوم",
          tempC: 36.5 + (v % 3) * 0.4,
          systolic: 110 + ((i * 3) % 40),
          diastolic: 70 + ((i * 2) % 18),
          pulse: 68 + ((i * 5) % 26),
          spo2: 96 + (i % 4),
          weightKg: 60 + ((i * 3) % 35),
          heightCm: 155 + ((i * 2) % 30),
          createdById: admin.id,
        },
      });
    }

    // --- hepatitis B series and serology
    const doses = i % 5 === 0 ? 1 : i % 5 === 1 ? 2 : 3;
    for (let d = 1; d <= doses; d++) {
      await db.vaccination.create({
        data: {
          employeeId: employee.id,
          vaccineCode: "HEP_B",
          vaccineName: "Hepatitis B vaccine",
          doseNumber: d,
          givenAt: daysAgo(400 - d * 30),
          lotNumber: `HB-${2025 + (d % 2)}-${100 + i}`,
          site: "LEFT_DELTOID",
          provider: "عيادة الموظف",
          createdById: admin.id,
        },
      });
    }

    if (i % 3 !== 2) {
      await db.vaccination.create({
        data: {
          employeeId: employee.id,
          vaccineCode: "INFLUENZA",
          vaccineName: "Seasonal influenza",
          doseNumber: 1,
          givenAt: daysAgo(200 + (i % 200)),
          provider: "عيادة الموظف",
          createdById: admin.id,
        },
      });
    }

    if (doses === 3) {
      const titre = i % 6 === 0 ? 3.2 : 42 + (i % 90);
      await db.labResult.create({
        data: {
          employeeId: employee.id,
          testCode: "ANTI_HBS",
          testName: "Anti-HBs",
          resultType: "QUANTITATIVE",
          valueNum: titre,
          unit: "mIU/mL",
          refLow: 10,
          flag: titre >= 10 ? "NORMAL" : "LOW",
          collectedAt: daysAgo(180 - (i % 60)),
          verifiedAt: daysAgo(179 - (i % 60)),
          orderNo: `ORD-${41000 + i}`,
          sampleNo: `S-${9000 + i}`,
          labName: "مختبر مستشفى الحديثة العام",
          performedBy: "فني المختبر",
          verifiedBy: "أخصائي المختبر",
          requiresReview: false,
          createdById: admin.id,
        },
      });

      await db.labResult.create({
        data: {
          employeeId: employee.id,
          testCode: "HBSAG",
          testName: "HBsAg",
          resultType: "QUALITATIVE",
          valueText: "Non-Reactive",
          flag: "NON_REACTIVE",
          collectedAt: daysAgo(180 - (i % 60)),
          orderNo: `ORD-${41000 + i}`,
          labName: "مختبر مستشفى الحديثة العام",
          createdById: admin.id,
        },
      });
    }

    // --- a couple of chemistry results, one of them deliberately critical
    if (i % 4 === 1) {
      const a1c = i === 5 ? 11.4 : 5.2 + (i % 5) * 0.4;
      await db.labResult.create({
        data: {
          employeeId: employee.id,
          testCode: "HBA1C",
          testName: "HbA1c",
          resultType: "QUANTITATIVE",
          valueNum: a1c,
          unit: "%",
          refLow: 4.0,
          refHigh: 5.6,
          flag: a1c >= 10 ? "CRITICAL_HIGH" : a1c > 5.6 ? "HIGH" : "NORMAL",
          collectedAt: daysAgo(45 + i),
          orderNo: `ORD-${42000 + i}`,
          labName: "مختبر مستشفى الحديثة العام",
          requiresReview: a1c > 5.6,
          createdById: admin.id,
        },
      });
    }

    if (i % 6 === 3) {
      await db.allergy.create({
        data: {
          employeeId: employee.id,
          type: "DRUG",
          substance: "بنسلين",
          severity: i === 3 ? "LIFE_THREATENING" : "MODERATE",
          reaction: "طفح جلدي وضيق تنفس",
          action: "تجنب البنسلين ومشتقاته",
          certainty: "CONFIRMED",
          allergyStatus: "ACTIVE",
          createdById: admin.id,
        },
      });
    }

    if (i % 5 === 2) {
      await db.healthEducation.create({
        data: {
          employeeId: employee.id,
          topic: "السلامة من الوخز بالإبر",
          method: "جلسة فردية",
          providedAt: daysAgo(60 + i),
          createdById: admin.id,
        },
      });
    }
  }

  console.log("Demo cohort created: 24 employees with visits, immunisation and laboratory results.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

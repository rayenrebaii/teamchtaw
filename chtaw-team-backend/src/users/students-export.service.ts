import { Injectable } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { Workbook } from "exceljs";
import { AccessService, Actor } from "../common/access";
import { PrismaService } from "../prisma/prisma.module";

export class StudentsExportQuery {
  @IsOptional() @IsIn(["fr", "en"])
  language?: "fr" | "en";
}

@Injectable()
export class StudentsExportService {
  constructor(private db: PrismaService, private access: AccessService) {}

  async export(actor: Actor, language: "fr" | "en" = "fr") {
    const students = await this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      return tx.user.findMany({
        where: { role: "USER" },
        select: {
          lastName: true, firstName: true, email: true, phone: true,
          memberships: { select: { group: { select: { name: true } } }, orderBy: { group: { name: "asc" } } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      });
    });
    const workbook = new Workbook();
    workbook.creator = "Chtaw Team";
    const sheet = workbook.addWorksheet(language === "en" ? "Students" : "Étudiants", { views: [{ state: "frozen", ySplit: 1 }] });
    const headers = language === "en" ? ["Last name", "First name", "Email", "Phone number", "Groups"] : ["Nom", "Prénom", "Email", "Téléphone", "Groupes"];
    sheet.columns = headers.map((header, index) => ({ header, width: [24, 24, 40, 22, 55][index], style: { numFmt: "@", alignment: { vertical: "top", wrapText: true } } }));
    for (const student of students) {
      // Plain string cells: keep +216/leading zeros and never interpret names as formulas.
      sheet.addRow([student.lastName, student.firstName, student.email, student.phone ?? "", student.memberships.map(member => member.group.name).join(" ; ")]);
    }
    sheet.autoFilter = "A1:E1";
    sheet.getRow(1).height = 25;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF61338C" } };
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

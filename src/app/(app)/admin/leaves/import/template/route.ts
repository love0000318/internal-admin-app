import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getPrisma } from "@/lib/db/prisma";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { getUserLedgerBalance } from "@/lib/leave/ledger";
import { requireOwner } from "@/lib/rbac/server-guards";

const TEMPLATE_FILE_NAME = "leave-balance-import-template.xlsx";

function helpRows() {
  return [
    ["항목", "안내"],
    ["필수 컬럼", "직원명, 사번 또는 이메일, 기준연도, 잔여 연차는 반드시 확인해 주세요."],
    ["직원 매칭", "시스템은 사번, 이메일, 전화번호, 이름+팀, 이름 순서로 직원을 매칭합니다."],
    ["기준연도", "업로드하려는 휴가 기준 연도를 숫자로 입력합니다. 예: 2026"],
    ["수량 단위", "총 부여 연차, 사용 연차, 승인대기 연차, 잔여 연차는 0.5일 단위 입력을 권장합니다."],
    ["음수 잔여 금지", "잔여 연차는 음수로 입력하지 마세요. 조정이 필요한 경우 미리보기에서 차이값을 확인합니다."],
    ["기능 목적", "엑셀 업로드는 과거 휴가 요청을 복원하는 기능이 아니라 잔여 휴가를 맞추기 위한 조정 기능입니다."],
    ["반영 절차", "업로드 후 바로 반영되지 않습니다. 미리보기에서 직원 매칭과 조정값을 확인한 뒤 최종 반영합니다."],
    ["민감정보 금지", "주민등록번호, 계좌번호, 주소, 급여, 가족정보, 증명자료 내용은 파일에 넣지 마세요."],
  ];
}

export async function GET() {
  const actor = await requireOwner();
  const prisma = getPrisma();
  const year = Number(todayInSeoul().slice(0, 4));
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { not: "EXTERNAL_PARTNER" },
    },
    include: {
      team: true,
      profile: true,
    },
    orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
  });

  const rows = await Promise.all(
    users.map(async (user) => {
      const balance = await getUserLedgerBalance({
        userId: user.id,
        year,
        prisma,
      });

      return {
        직원명: user.profile?.displayName ?? user.name,
        이메일: user.email,
        사번: user.profile?.employeeNumber ?? "",
        팀: user.team?.name ?? "",
        기준연도: year,
        "총 부여 연차": balance.grantedAmount,
        "사용 연차": balance.usedAmount,
        "승인대기 연차": balance.pendingAmount,
        "잔여 연차": balance.remainingAmount,
        "조정 메모": "",
      };
    }),
  );

  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      "직원명",
      "이메일",
      "사번",
      "팀",
      "기준연도",
      "총 부여 연차",
      "사용 연차",
      "승인대기 연차",
      "잔여 연차",
      "조정 메모",
    ],
  });
  dataSheet["!cols"] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(workbook, dataSheet, "휴가 현황 업로드");

  const helpSheet = XLSX.utils.aoa_to_sheet(helpRows());
  helpSheet["!cols"] = [{ wch: 18 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, helpSheet, "업로드 안내");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_BALANCE_IMPORT_TEMPLATE_DOWNLOADED",
      targetType: "LEAVE_IMPORT_BATCH",
      targetId: null,
      metadata: {
        rowCount: rows.length,
        referenceYear: year,
      },
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILE_NAME}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

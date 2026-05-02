import { describe, expect, it } from "vitest";

import {
  getAttachmentStatusForPolicy,
  LeaveAttachmentError,
  sanitizeOriginalFileName,
  validateLeaveAttachmentFile,
} from "@/lib/leave/attachments";

describe("leave attachment helpers", () => {
  it("maps attachment policy to request attachment status", () => {
    expect(
      getAttachmentStatusForPolicy({
        attachmentPolicy: "NOT_REQUIRED",
        hasAttachment: false,
      }),
    ).toBe("NOT_REQUIRED");
    expect(
      getAttachmentStatusForPolicy({
        attachmentPolicy: "OPTIONAL",
        hasAttachment: false,
      }),
    ).toBe("OPTIONAL");
    expect(
      getAttachmentStatusForPolicy({
        attachmentPolicy: "REQUIRED_AFTER_REQUEST",
        hasAttachment: false,
      }),
    ).toBe("REQUIRED_NOT_SUBMITTED");
    expect(
      getAttachmentStatusForPolicy({
        attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
        hasAttachment: true,
      }),
    ).toBe("SUBMITTED");
  });

  it("rejects required-before-request without an attachment", () => {
    expect(() =>
      getAttachmentStatusForPolicy({
        attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
        hasAttachment: false,
      }),
    ).toThrow(LeaveAttachmentError);
  });

  it("validates mime type and file size", () => {
    expect(
      validateLeaveAttachmentFile({
        fileName: "reserve.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      }),
    ).toMatchObject({
      originalFileName: "reserve.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
    });

    expect(() =>
      validateLeaveAttachmentFile({
        fileName: "script.exe",
        mimeType: "application/x-msdownload",
        fileSize: 1024,
      }),
    ).toThrow(LeaveAttachmentError);
  });

  it("sanitizes original file names", () => {
    expect(sanitizeOriginalFileName("../진단서\r\n.pdf")).toBe("진단서__.pdf");
  });
});

import { describe, expect, it } from "vitest";

import {
  canContinueWithoutStoredAttachment,
  getAttachmentStatusForPolicy,
  LeaveAttachmentError,
  prepareAttachmentFromFormData,
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

  it("skips absent, empty, and nameless attachment inputs", async () => {
    const missing = new FormData();
    const emptyString = new FormData();
    const emptyFile = new FormData();
    const namelessFile = new FormData();

    emptyString.set("attachmentFile", "");
    emptyFile.set(
      "attachmentFile",
      new File([], "reserve.pdf", { type: "application/pdf" }),
    );
    namelessFile.set(
      "attachmentFile",
      new File(["content"], "", { type: "application/pdf" }),
    );

    await expect(prepareAttachmentFromFormData(missing)).resolves.toBeNull();
    await expect(prepareAttachmentFromFormData(emptyString)).resolves.toBeNull();
    await expect(prepareAttachmentFromFormData(emptyFile)).resolves.toBeNull();
    await expect(prepareAttachmentFromFormData(namelessFile)).resolves.toBeNull();
  });

  it("allows optional attachment storage failures to be skipped safely", () => {
    const storageError = new LeaveAttachmentError("attachment-storage");
    const validationError = new LeaveAttachmentError("invalid-file-type");

    expect(
      canContinueWithoutStoredAttachment({
        attachmentPolicy: "OPTIONAL",
        error: storageError,
      }),
    ).toBe(true);
    expect(
      canContinueWithoutStoredAttachment({
        attachmentPolicy: "NOT_REQUIRED",
        error: storageError,
      }),
    ).toBe(true);
    expect(
      canContinueWithoutStoredAttachment({
        attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
        error: storageError,
      }),
    ).toBe(false);
    expect(
      canContinueWithoutStoredAttachment({
        attachmentPolicy: "OPTIONAL",
        error: validationError,
      }),
    ).toBe(false);
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

"use client";

import type { StepUpPurpose } from "@/generated/prisma/client";
import type { ReactNode } from "react";
import { useState } from "react";
import { StepUpDialog } from "@/components/security/StepUpDialog";

type StepUpSubmitButtonProps = {
  formId: string;
  purpose: StepUpPurpose;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  description?: string;
};

export function StepUpSubmitButton({
  formId,
  purpose,
  children,
  className,
  disabled = false,
  title,
  description,
}: StepUpSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  const submitForm = () => {
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  };

  const openDialog = () => {
    setDialogKey((current) => current + 1);
    setOpen(true);
  };

  return (
    <>
      <button type="button" disabled={disabled} className={className} onClick={openDialog}>
        {children}
      </button>
      <StepUpDialog
        key={dialogKey}
        open={open}
        onOpenChange={setOpen}
        purpose={purpose}
        title={title}
        description={description}
        onVerified={submitForm}
      />
    </>
  );
}

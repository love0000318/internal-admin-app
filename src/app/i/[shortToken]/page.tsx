import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type ShortInvitationPageProps = {
  params: Promise<{
    shortToken: string;
  }>;
};

export default async function ShortInvitationPage({
  params,
}: ShortInvitationPageProps) {
  const { shortToken } = await params;

  redirect(`/invitations/accept?shortToken=${encodeURIComponent(shortToken)}`);
}

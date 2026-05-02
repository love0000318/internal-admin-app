import { redirect } from "next/navigation";

type SignupInvitePageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function SignupInvitePage({
  searchParams,
}: SignupInvitePageProps) {
  const { token } = await searchParams;
  const query = token ? `?token=${encodeURIComponent(token)}` : "";

  redirect(`/invitations/accept${query}`);
}

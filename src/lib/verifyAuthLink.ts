type EmailType = 'recovery' | 'signup' | 'magiclink' | 'email' | 'invite';
interface LinkClient {
  auth: {
    verifyOtp(args: { token_hash: string; type: EmailType }): Promise<{ error: unknown }>;
    getSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
    getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export async function verifyAuthLink(client: LinkClient, href: string, recovery: boolean,
  implicit: { hasToken: boolean; type: string | null }) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has('error') || fragment.has('error')) throw new Error('Invalid email link');
  const hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (hash) {
    if (recovery ? type !== 'recovery' : !['signup', 'magiclink', 'email', 'invite'].includes(type || '')) throw new Error('Invalid email link');
    const { error } = await client.auth.verifyOtp({ token_hash: hash, type: type as EmailType });
    if (error) throw error;
  } else if (!implicit.hasToken || (recovery && implicit.type !== 'recovery')) {
    throw new Error('No recovery or confirmation token');
  }
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) throw new Error('Expired email link');
  const { data: { user }, error: userError } = await client.auth.getUser(session.access_token);
  if (userError || !user?.id) throw new Error('Invalid email session');
}

/** The invite sheet's words. It says the email went out only when it did. Pure. */
export function inviteSheetCopy({ first, email, emailed, days }: { first: string; email: string; emailed: boolean; days: number }) {
  return {
    title: emailed ? `Invite emailed to ${first}` : "Share this link",
    lead: emailed
      ? `Sent to ${email}. If it doesn't arrive, send ${first} this link yourself.`
      : `Send ${first} this link by text or however you usually reach them. It signs them in to Atlas.`,
    foot: `It works once and expires in ${days} days. Once ${first} is in, they can set a password from their You tab. Inviting again makes a new link.`,
  };
}

export const mentionsEveryone = (text: string) => /(^|\s)@tous(?=$|[\s.,!?;:])/iu.test(text);
export function isMentioned(message: { text: string; mentionIds: string[] }, userId: string) {
  return mentionsEveryone(message.text) || message.mentionIds.includes(userId);
}

export const getValueFromEnv = (v: string): string | undefined => {
  return typeof window !== 'undefined'
    ? window.import.meta?.env?.[v]
    : process.env?.[v]
}

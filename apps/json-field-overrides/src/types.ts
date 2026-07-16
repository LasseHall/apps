export type DialogResult = {
  source: { [key: string]: unknown };
  resetOverrides: boolean;
};

export type DialogInvocationParameters = {
  currentSourceJson?: string;
};

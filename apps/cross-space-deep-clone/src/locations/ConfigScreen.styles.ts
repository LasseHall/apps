import { css } from '@emotion/css';

export const styles = {
  page: css({
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    padding: '32px 24px 64px',
    boxSizing: 'border-box',
  }),
  content: css({
    width: '100%',
    maxWidth: '720px',
  }),
  textInputLabel: css({
    fontWeight: 600,
  }),
};

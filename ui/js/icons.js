import { h } from 'vue';

// Local, dependency-free icon registry. Every icon shares one visual language:
// 24px viewBox, 1.8px round outline, and currentColor for semantic theming.
const paths = {
  brand: 'M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7',
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z',
  chat: 'M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z',
  operations: 'M5 12h3l2-6 4 12 2-6h3M4 4v16h16',
  history: 'M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2',
  capabilities: 'M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z',
  personality: 'M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0',
  system: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  panelLeft: 'M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  search: 'm21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  logout: 'M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5',
  success: 'm5 12 4 4L19 6',
  warning: 'M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01',
  error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6',
  edit: 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4',
  trash: 'M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13',
  brain: 'M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16',
  refresh: 'M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14',
  close: 'M6 6l12 12M18 6 6 18',
  command: 'M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z',
  external: 'M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6',
  activity: 'M4 12h4l2-5 4 10 2-5h4',
  shield: 'M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z',
  database: 'M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6',
  server: 'M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01',
};

export const iconNames = Object.freeze(Object.keys(paths));

export const OdinIcon = {
  name: 'OdinIcon',
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 18 },
    strokeWidth: { type: [Number, String], default: 1.8 },
  },
  setup(props, { attrs }) {
    return () => h('svg', {
      ...attrs,
      class: ['odin-icon', attrs.class],
      width: props.size,
      height: props.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': props.strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': attrs['aria-label'] ? undefined : 'true',
      focusable: 'false',
    }, [h('path', { d: paths[props.name] || paths.info })]);
  },
};

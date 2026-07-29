import type { SVGProps } from 'react';

const SvgLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <rect x={3} y={3} width={18} height={18} rx={5} stroke="currentColor" strokeWidth={1.8} />
    <path
      d="M7 15.4 10.2 12l2.9 1.7L17.4 8"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
    <path
      d="M7 17.5h10"
      stroke="currentColor"
      strokeLinecap="round"
      strokeOpacity={0.35}
      strokeWidth={1.6}
    />
  </svg>
);
export default SvgLogo;

import type { SVGProps } from 'react';

const SvgLogoWhite = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <path
      d="M3 8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8Z"
      stroke="#fff"
      strokeWidth={1.8}
    />
    <path
      d="M7 15.4 10.2 12l2.9 1.7L17.4 8"
      stroke="#fff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
    <path
      d="M7 17.5h10"
      stroke="#fff"
      strokeLinecap="round"
      strokeOpacity={0.35}
      strokeWidth={1.6}
    />
  </svg>
);
export default SvgLogoWhite;

import { Link } from "@/lib/router-compat";
import whiteLogoAsset from "@/assets/rocket-logo-white.png.asset.json";

type Props = { to?: string; size?: "sm" | "md" | "lg"; className?: string };

const Logo = ({ to = "/", size = "md", className = "" }: Props) => {
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-14" : "h-11";
  const body = (
    <>
      <img
        src="/rocket-email-logo.png"
        alt="Rocket"
        className={`logo-light ${h} block w-auto object-contain ${className}`}
      />
      <img
        src={whiteLogoAsset.url}
        alt=""
        aria-hidden="true"
        className={`logo-dark ${h} block w-auto object-contain ${className}`}
      />
    </>
  );
  return to ? <Link to={to} className="inline-flex items-center">{body}</Link> : body;
};

export default Logo;

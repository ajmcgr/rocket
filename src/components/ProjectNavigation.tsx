import { NavLink } from "@/lib/router-compat";

type ProjectSection = "brand" | "designs" | "templates" | "downloads" | "settings";

type ProjectNavigationProps = {
  projectId: string;
  active: ProjectSection;
};

const sections: { key: ProjectSection; label: string; href: (projectId: string) => string }[] = [
  { key: "brand", label: "Brand", href: (projectId) => `/brands/${projectId}` },
  { key: "designs", label: "Designs", href: (projectId) => `/projects/${projectId}` },
  { key: "templates", label: "Templates", href: (projectId) => `/projects/${projectId}?section=templates` },
  { key: "downloads", label: "Downloads", href: (projectId) => `/projects/${projectId}/hub` },
  { key: "settings", label: "Settings", href: (projectId) => `/projects/${projectId}?section=settings` },
];

export default function ProjectNavigation({ projectId, active }: ProjectNavigationProps) {
  return (
    <nav aria-label="Project navigation" className="flex flex-wrap gap-1 border-b border-neutral-200">
      {sections.map((section) => (
        <NavLink
          key={section.key}
          to={section.href(projectId)}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
            active === section.key
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-900"
          }`}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}

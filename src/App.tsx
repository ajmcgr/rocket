import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home.tsx";
import NotFound from "./pages/NotFound.tsx";
import Reserve from "./pages/Reserve.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import VerifyEmail from "./pages/VerifyEmail.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
const Index = lazy(() => import("./pages/Index.tsx"));
const Generate = lazy(() => import("./pages/Generate.tsx"));
const CreateEntry = lazy(() => import("./pages/CreateEntry.tsx"));
const LogoStudio = lazy(() => import("./pages/LogoStudio.tsx"));
const SavedLogos = lazy(() => import("./pages/SavedLogos.tsx"));
const IconDesigner = lazy(() => import("./pages/IconDesigner.tsx"));
const LogoDesigner = lazy(() => import("./pages/LogoDesigner.tsx"));
const Editor = lazy(() => import("./pages/Editor.tsx"));
const Presenter = lazy(() => import("./pages/Presenter.tsx"));
const Assets = lazy(() => import("./pages/Assets.tsx"));
const Trash = lazy(() => import("./pages/Trash.tsx"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail.tsx"));
const Brand = lazy(() => import("./pages/Brand.tsx"));
const BrandLayout = lazy(() => import("./pages/BrandLayout.tsx"));
const BrandHub = lazy(() => import("./pages/BrandHub.tsx"));
const BrandKit = lazy(() => import("./pages/BrandKit.tsx"));
const BrandKitHub = lazy(() => import("./pages/BrandKitHub.tsx"));
const LogoFiles = lazy(() => import("./pages/LogoFiles.tsx"));
const WebsiteTemplates = lazy(() => import("./pages/WebsiteTemplates.tsx"));
const PaletteExplorer = lazy(() => import("./pages/PaletteExplorer.tsx"));
const FontExplorer = lazy(() => import("./pages/FontExplorer.tsx"));
const SocialKit = lazy(() => import("./pages/SocialKit.tsx"));
const SocialIcons = lazy(() => import("./pages/SocialIcons.tsx"));
const BrandGuidelines = lazy(() => import("./pages/BrandGuidelines.tsx"));
const ProjectWizard = lazy(() => import("./pages/ProjectWizard.tsx"));
const Templates = lazy(() => import("./pages/Templates.tsx"));
const Insights = lazy(() => import("./pages/Insights.tsx"));
const Notifications = lazy(() => import("./pages/Notifications.tsx"));
const SharedAsset = lazy(() => import("./pages/SharedAsset.tsx"));
const SharedProject = lazy(() => import("./pages/SharedProject.tsx"));
const Gallery = lazy(() => import("./pages/Gallery.tsx"));
const SettingsLayout = lazy(() => import("./pages/Settings.tsx"));
const ProfileSettings = lazy(() => import("./pages/Settings.tsx").then((module) => ({ default: module.ProfileSettings })));
const IntegrationsSettings = lazy(() => import("./pages/Settings.tsx").then((module) => ({ default: module.IntegrationsSettings })));
const NotificationsSettings = lazy(() => import("./pages/Settings.tsx").then((module) => ({ default: module.NotificationsSettings })));
const AccountSettings = lazy(() => import("./pages/Settings.tsx").then((module) => ({ default: module.AccountSettings })));
const BillingSettings = lazy(() => import("./pages/Settings.tsx").then((module) => ({ default: module.BillingSettings })));
const Team = lazy(() => import("./pages/Team.tsx"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite.tsx"));
const About = lazy(() => import("./pages/About.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.tsx"));
const BlogAuthor = lazy(() => import("./pages/BlogAuthor.tsx"));
const ResourcesHub = lazy(() => import("./pages/Resources.tsx"));
const PillarPage = lazy(() => import("./pages/Resources.tsx").then((module) => ({ default: module.PillarPage })));
const Compare = lazy(() => import("./pages/Compare.tsx"));
const ComparisonDetail = lazy(() => import("./pages/ComparisonDetail.tsx"));
const MediaKit = lazy(() => import("./pages/MediaKit.tsx"));
const Tools = lazy(() => import("./pages/Tools.tsx"));
const ToolDetail = lazy(() => import("./pages/ToolDetail.tsx"));
const Pricing = lazy(() => import("./pages/Pricing.tsx"));
const FAQ = lazy(() => import("./pages/FAQ.tsx"));
const AIInfo = lazy(() => import("./pages/AIInfo.tsx"));
const RocketConnectAuthorize = lazy(() => import("./pages/RocketConnectAuthorize.tsx"));
import Discover from "./pages/Discover.tsx";
const SavedApps = lazy(() => import("./pages/SavedApps.tsx"));
const PublicAppProfile = lazy(() => import("./pages/PublicAppProfile.tsx"));
const AddApp = lazy(() => import("./pages/AddApp.tsx"));
const MyApps = lazy(() => import("./pages/MyApps.tsx"));
const AppAnalytics = lazy(() => import("./pages/AppAnalytics.tsx"));
const AppRevenue = lazy(() => import("./pages/AppRevenue.tsx"));
const Developer = lazy(() => import("./pages/Developer.tsx"));
const DeveloperActivate = lazy(() => import("./pages/Developer.tsx").then((module) => ({ default: module.DeveloperActivate })));
const DeveloperAppDetail = lazy(() => import("./pages/Developer.tsx").then((module) => ({ default: module.DeveloperAppDetail })));
const BrandTemplates = lazy(() => import("./pages/BrandTemplates.tsx").then((module) => ({ default: module.BrandTemplates })));
const BrandTemplateDetail = lazy(() => import("./pages/BrandTemplates.tsx").then((module) => ({ default: module.BrandTemplateDetail })));
const AppShell = lazy(() => import("./components/AppShell.tsx"));
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import { ScrollToTop } from "./components/ScrollToTop.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { NotificationsProvider } from "./contexts/NotificationsContext.tsx";

const queryClient = new QueryClient();

const AssetRouteRedirect = () => {
  const { id } = useParams();
  return <Navigate to={id ? `/editor?id=${id}` : "/designs"} replace />;
};

const StudioRedirect = () => {
  const { id } = useParams();
  return <Navigate to={id ? `/brands/${id}` : "/brands"} replace />;
};

const BrandIdRedirect = () => {
  const { id } = useParams();
  return <Navigate to={id ? `/brands/${id}` : "/brands"} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NotificationsProvider>
            <ScrollToTop />
          <Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-sm text-neutral-500">Loading Rocket…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create/branding" element={<Index />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/apps/:id" element={<PublicAppProfile />} />
            <Route path="/reserve" element={<Reserve />} />
            <Route path="/join" element={<Navigate to="/reserve" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/about" element={<About />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/author/:id" element={<BlogAuthor />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/resources" element={<ResourcesHub />} />
            <Route path="/resources/:slug" element={<PillarPage />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/compare/:slug" element={<ComparisonDetail />} />
            <Route path="/brand-kit" element={<MediaKit />} />
            <Route path="/media-kit" element={<Navigate to="/brand-kit" replace />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/tools/:slug" element={<ToolDetail />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/ai-info" element={<AIInfo />} />
              <Route path="/connect/authorize" element={<RocketConnectAuthorize />} />
            <Route path="/brand-templates" element={<BrandTemplates />} />
            <Route path="/brand-templates/:id" element={<BrandTemplateDetail />} />
            <Route path="/share/asset/:token" element={<SharedAsset />} />
            <Route path="/share/project/:token" element={<SharedProject />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/projects" element={<Navigate to="/logos" replace />} />
              <Route path="/apps/add" element={<AddApp />} />
              <Route path="/launch" element={<AddApp />} />
              <Route path="/my-apps" element={<MyApps />} />
              <Route path="/your-apps" element={<MyApps />} />
              <Route path="/saved-apps" element={<SavedApps />} />
              <Route path="/my-apps/:id/analytics" element={<AppAnalytics />} />
              <Route path="/my-apps/:id/revenue" element={<AppRevenue />} />
              <Route path="/projects/new" element={<ProjectWizard />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/studio" element={<Navigate to="/brands" replace />} />
              <Route path="/studio/:id" element={<StudioRedirect />} />
              <Route path="/files" element={<Navigate to="/brands" replace />} />
              <Route path="/brands" element={<BrandHub />} />
              <Route path="/brands/:id" element={<BrandLayout />}>
                <Route index element={<Brand />} />
                <Route path="brand-book" element={<BrandGuidelines />} />
                <Route path="palette" element={<PaletteExplorer />} />
                <Route path="fonts" element={<FontExplorer />} />
                <Route path="social-icons" element={<SocialIcons />} />
              </Route>
              <Route path="/brand" element={<Navigate to="/brands" replace />} />
              <Route path="/brand/:id" element={<BrandIdRedirect />} />
              <Route path="/projects/:id/brand-kit" element={<BrandKit />} />
              <Route path="/projects/:id/hub" element={<BrandKitHub />} />
              <Route path="/projects/:id/logo-files" element={<LogoFiles />} />
              <Route path="/projects/:id/websites" element={<WebsiteTemplates />} />
              <Route path="/projects/:id/palettes" element={<PaletteExplorer />} />
              <Route path="/projects/:id/fonts" element={<FontExplorer />} />
              <Route path="/projects/:id/social" element={<SocialKit />} />
              <Route path="/projects/:id/guidelines" element={<BrandGuidelines />} />
              <Route path="/designs" element={<Assets />} />
              <Route path="/designs/:id" element={<AssetRouteRedirect />} />
              <Route path="/assets" element={<Navigate to="/designs" replace />} />
              <Route path="/assets/:id" element={<AssetRouteRedirect />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="/create" element={<CreateEntry />} />
              <Route path="/wizard" element={<LogoStudio />} />
              <Route path="/create/generate" element={<Navigate to="/wizard" replace />} />
              <Route path="/create/chat" element={<Generate />} />
              <Route path="/saved" element={<SavedLogos />} />
              <Route path="/logos" element={<LogoDesigner />} />
              <Route path="/icons" element={<IconDesigner />} />
              <Route path="/editor" element={<Editor />} />
              <Route path="/present" element={<Presenter />} />
              <Route path="/dashboard" element={<Navigate to="/logos" replace />} />
              <Route path="/generate" element={<Navigate to="/logos" replace />} />
              <Route path="/rocket/:id" element={<AssetRouteRedirect />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/profile" replace />} />
                <Route path="profile" element={<ProfileSettings />} />
                <Route path="team" element={<Team />} />
                <Route path="integrations" element={<IntegrationsSettings />} />
                <Route path="notifications" element={<NotificationsSettings />} />
                <Route path="account" element={<AccountSettings />} />
                <Route path="billing" element={<BillingSettings />} />
              </Route>
              <Route path="/account" element={<Navigate to="/settings/profile" replace />} />
              <Route path="/developer" element={<Developer />} />
              <Route path="/developer/activate" element={<DeveloperActivate />} />
              <Route path="/developer/apps/:clientId" element={<DeveloperAppDetail />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </NotificationsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

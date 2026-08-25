import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Reserve from "./pages/Reserve.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import VerifyEmail from "./pages/VerifyEmail.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Generate from "./pages/Generate.tsx";
import CreateEntry from "./pages/CreateEntry.tsx";
import LogoStudio from "./pages/LogoStudio.tsx";
import SavedLogos from "./pages/SavedLogos.tsx";
import IconDesigner from "./pages/IconDesigner.tsx";
import LogoDesigner from "./pages/LogoDesigner.tsx";
import Editor from "./pages/Editor.tsx";
import Presenter from "./pages/Presenter.tsx";
import Assets from "./pages/Assets.tsx";
import Trash from "./pages/Trash.tsx";
import ProjectDetail from "./pages/ProjectDetail.tsx";
import Studio from "./pages/Studio.tsx";
import Brand from "./pages/Brand.tsx";
import BrandLayout from "./pages/BrandLayout.tsx";
import BrandHub from "./pages/BrandHub.tsx";
import BrandKit from "./pages/BrandKit.tsx";
import BrandKitHub from "./pages/BrandKitHub.tsx";
import LogoFiles from "./pages/LogoFiles.tsx";
import WebsiteTemplates from "./pages/WebsiteTemplates.tsx";
import PaletteExplorer from "./pages/PaletteExplorer.tsx";
import FontExplorer from "./pages/FontExplorer.tsx";
import SocialKit from "./pages/SocialKit.tsx";
import SocialIcons from "./pages/SocialIcons.tsx";
import BrandGuidelines from "./pages/BrandGuidelines.tsx";
import ProjectWizard from "./pages/ProjectWizard.tsx";
import Templates from "./pages/Templates.tsx";
import Insights from "./pages/Insights.tsx";
import Notifications from "./pages/Notifications.tsx";
import SharedAsset from "./pages/SharedAsset.tsx";
import SharedProject from "./pages/SharedProject.tsx";
import Gallery from "./pages/Gallery.tsx";
import SettingsLayout, {
  ProfileSettings,
  IntegrationsSettings,
  NotificationsSettings,
  AccountSettings,
  BillingSettings,
} from "./pages/Settings.tsx";
import Team from "./pages/Team.tsx";
import AcceptInvite from "./pages/AcceptInvite.tsx";
import About from "./pages/About.tsx";
import Blog from "./pages/Blog.tsx";
import BlogPost from "./pages/BlogPost.tsx";
import BlogAuthor from "./pages/BlogAuthor.tsx";
import ResourcesHub, { PillarPage } from "./pages/Resources.tsx";
import Compare from "./pages/Compare.tsx";
import ComparisonDetail from "./pages/ComparisonDetail.tsx";
import MediaKit from "./pages/MediaKit.tsx";
import Tools from "./pages/Tools.tsx";
import ToolDetail from "./pages/ToolDetail.tsx";
import Pricing from "./pages/Pricing.tsx";
import FAQ from "./pages/FAQ.tsx";
import AIInfo from "./pages/AIInfo.tsx";
import AppShell from "./components/AppShell.tsx";
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
          <Routes>
            <Route path="/" element={<Index />} />
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
            <Route path="/share/asset/:token" element={<SharedAsset />} />
            <Route path="/share/project/:token" element={<SharedProject />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/projects" element={<Navigate to="/logos" replace />} />
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
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </NotificationsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

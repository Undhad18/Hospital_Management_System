import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validateRegistration, validateLogin } from "@shared";
import {
  Lock,
  Mail,
  User,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Database,
  Layers,
  Zap,
  Package,
} from "lucide-react";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("user");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState("");

  const { login, register, error, clearError, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getTargetDestination = (userRole) => {
    const requestedPath = location.state?.from?.pathname;
    if (requestedPath && requestedPath !== "/" && requestedPath !== "/login") {
      // If customer requested an admin-only page, don't send them to an error page
      if (userRole !== "admin" && (requestedPath.startsWith("/dashboard") || requestedPath.startsWith("/docs") || requestedPath.startsWith("/swagger"))) {
        return "/products";
      }
      return requestedPath;
    }
    return userRole === "admin" ? "/dashboard" : "/products";
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getTargetDestination(user.role), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    clearError();
    setFormErrors((prev) => ({ ...prev, [e.target.name]: "" }));
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validate = () => {
    const validation = isRegister
      ? validateRegistration(formData)
      : validateLogin(formData);

    if (validation.isValid) return {};

    const errorMap = {};
    validation.errors.forEach((err) => {
      errorMap[err.field] = err.message;
    });
    return errorMap;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setSuccessBanner("");

    try {
      if (isRegister) {
        const res = await register(
          formData.name,
          formData.email,
          formData.password,
          role
        );
        if (res.success) {
          setSuccessBanner("Account registered successfully! Redirecting...");
          const target = getTargetDestination(res.user?.role || role);
          setTimeout(() => navigate(target, { replace: true }), 700);
        }
      } else {
        const res = await login(formData.email, formData.password);
        if (res.success) {
          setSuccessBanner(
            res.user?.role === "admin"
              ? "Admin access verified! Launching Command Center..."
              : "Authentication verified! Launching Product Catalog..."
          );
          const target = getTargetDestination(res.user?.role);
          setTimeout(() => navigate(target, { replace: true }), 700);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Demo auto-fill helpers
  const fillDemoAdmin = () => {
    setIsRegister(false);
    setFormData({
      name: "",
      email: "admin@example.com",
      password: "password123",
    });
    setFormErrors({});
  };

  const fillDemoUser = () => {
    setIsRegister(false);
    setFormData({
      name: "",
      email: "user@example.com",
      password: "password123",
    });
    setFormErrors({});
  };

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden radial-mesh">
      {/* Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10 my-8">
        {/* Left Column: Brand Hero & Architecture Badges */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>MERN Stack + MySQL Roadmap</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight font-heading">
              Enterprise <br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Full-Stack Portal
              </span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto lg:mx-0">
              Complete implementation of JWT authentication, ACID transactions, Multer uploads, TanStack Query caching, and OpenAPI client generation.
            </p>
          </div>

          {/* Architecture Feature Cards */}
          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto lg:mx-0 text-left">
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-2 text-indigo-400">
                <Database className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">MySQL ACID Engine</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Row-level locking on checkout</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-2 text-violet-400">
                <Zap className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-white">TanStack Query v5</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Automated cache invalidation</p>
            </div>
          </div>
        </div>

        {/* Right Column: Glassmorphism Auth Card */}
        <div className="lg:col-span-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl backdrop-blur-2xl relative">
            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-950/80 border border-white/5 mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  clearError();
                  setFormErrors({});
                }}
                className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  !isRegister
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  clearError();
                  setFormErrors({});
                }}
                className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  isRegister
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error & Success Feedback Banners */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5 mb-5 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Authentication Failed</p>
                  <p className="text-[11px] text-rose-300/80 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {successBanner && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5 mb-5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">{successBanner}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field (Register only) */}
              {isRegister && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Jane Doe"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition ${
                        formErrors.name ? "border-rose-500/80" : "border-white/10"
                      }`}
                    />
                  </div>
                  {formErrors.name && (
                    <p className="text-[11px] text-rose-400">{formErrors.name}</p>
                  )}
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="user@example.com"
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition ${
                      formErrors.email ? "border-rose-500/80" : "border-white/10"
                    }`}
                  />
                </div>
                {formErrors.email && (
                  <p className="text-[11px] text-rose-400">{formErrors.email}</p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className={`w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition ${
                      formErrors.password ? "border-rose-500/80" : "border-white/10"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formErrors.password && (
                  <p className="text-[11px] text-rose-400">{formErrors.password}</p>
                )}
              </div>

              {/* Role Picker (Register only) */}
              {isRegister && (
                <div className="space-y-1 pt-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Assign Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole("user")}
                      className={`py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        role === "user"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10"
                      }`}
                    >
                      User Access
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("admin")}
                      className={`py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        role === "admin"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10"
                      }`}
                    >
                      Admin Access
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>{isRegister ? "Create Account" : "Sign In to Workspace"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Credentials Autofill */}
            <div className="pt-6 mt-6 border-t border-white/5 text-center">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2.5">
                Quick Demo Autofill
              </span>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={fillDemoAdmin}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-white/5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                >
                  Admin Account
                </button>
                <button
                  type="button"
                  onClick={fillDemoUser}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-white/5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                >
                  Standard User
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const FeatureFlagContext = createContext(null);
const API_BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";

export const FeatureFlagProvider = ({ children }) => {
  const { user } = useAuth();
  const [flags, setFlags] = useState({});
  const [rawFlagsList, setRawFlagsList] = useState([]);
  const [localOverrides, setLocalOverrides] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch evaluated flags from backend
  const loadFlags = async () => {
    setIsLoading(true);
    try {
      const userId = user?.id || 1;
      const role = user?.role || "customer";
      const email = user?.email || "customer@shopsphere.io";

      const [evalRes, allRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/feature-flags/evaluate?userId=${userId}&role=${role}&email=${encodeURIComponent(email)}`),
        fetch(`${API_BASE_URL}/api/feature-flags`),
      ]);

      if (evalRes.ok) {
        const evalData = await evalRes.json();
        if (evalData.success) {
          setFlags(evalData.flags || {});
        }
      }

      if (allRes.ok) {
        const allData = await allRes.json();
        if (allData.success) {
          setRawFlagsList(allData.data || []);
        }
      }
    } catch (err) {
      console.warn("Could not load feature flags from server:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, [user]);

  /**
   * Check if a specific feature flag is active for current user
   */
  const isFeatureEnabled = (flagKey, defaultVal = false) => {
    // Check local override first (for instant QA toggle)
    if (localOverrides[flagKey] !== undefined) {
      return Boolean(localOverrides[flagKey]);
    }

    const flag = flags[flagKey];
    if (!flag) return defaultVal;
    return Boolean(flag.enabled);
  };

  /**
   * Get variant payload for a feature flag
   */
  const getFeatureVariant = (flagKey) => {
    const flag = flags[flagKey];
    return flag?.variant || null;
  };

  /**
   * Set a temporary local override for QA preview
   */
  const setOverride = (flagKey, value) => {
    setLocalOverrides((prev) => {
      const next = { ...prev };
      if (value === null || value === undefined) {
        delete next[flagKey];
      } else {
        next[flagKey] = Boolean(value);
      }
      return next;
    });
  };

  /**
   * Clear all local overrides
   */
  const clearOverrides = () => {
    setLocalOverrides({});
  };

  return (
    <FeatureFlagContext.Provider
      value={{
        flags,
        rawFlagsList,
        localOverrides,
        isLoading,
        isFeatureEnabled,
        getFeatureVariant,
        setOverride,
        clearOverrides,
        reloadFlags: loadFlags,
      }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = () => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error("useFeatureFlags must be used within a FeatureFlagProvider");
  }
  return context;
};

export const useFeatureFlag = (flagKey, defaultVal = false) => {
  const { isFeatureEnabled, getFeatureVariant } = useFeatureFlags();
  return {
    enabled: isFeatureEnabled(flagKey, defaultVal),
    variant: getFeatureVariant(flagKey),
  };
};

import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isStaffMember, hasStaffPermission, StaffPermission, StaffRole } from '../lib/permissions';

interface RequireStaffProps {
  children?: React.ReactNode;
  requiredPermission?: StaffPermission;
}

export const RequireStaff: React.FC<RequireStaffProps> = ({ children, requiredPermission }) => {
  const { user, loading } = useAuth();
  const [access, setAccess] = useState<{ role: string; isOwner: boolean } | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchStaffRole = async () => {
      if (!user) {
        setFetching(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/staff/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setAccess({
              role: typeof data.role === "string" ? data.role : "user",
              isOwner: data.isOwner === true
            });
          }
        }
      } catch (err) {
        console.error('Failed to verify staff permission:', err);
      } finally {
        if (active) setFetching(false);
      }
    };

    fetchStaffRole();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // The backend verifies the Firebase token and trusted owner identity.
  // Never grant owner access using a client-side email comparison alone.
  const isOwner = access?.isOwner === true;
  const role = access?.role as StaffRole | undefined;

  if (!isOwner && !isStaffMember(role || 'user')) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && !isOwner && !hasStaffPermission(role || 'user', requiredPermission)) {
    return <Navigate to="/staff" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RequireStaff;

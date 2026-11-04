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
  const [role, setRole] = useState<StaffRole | null>(null);
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
          if (active) setRole(data.role as StaffRole);
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

  // Owner always has access
  const isOwner = user.email === 'khyhajmr08@gmail.com' || user.uid === 'PqXqqCgdC1eYPz4HKHHLtDRejPD3';

  if (!isOwner && !isStaffMember(role || 'user')) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && !isOwner && !hasStaffPermission(role || 'user', requiredPermission)) {
    return <Navigate to="/staff" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RequireStaff;

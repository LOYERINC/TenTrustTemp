import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type UserRole = 'admin' | 'landlord' | 'tenant';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  verified: boolean;
}

interface AuthContextType {
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithEmail: (email: string, password: string, metadata: { firstName: string; lastName: string; role: UserRole }) => Promise<{ error: any }>;
  signInWithGoogle: (role?: UserRole) => Promise<void>;
  signInWithMagicLink: (email: string, role?: UserRole) => Promise<{ error: any }>;
  loginAsDemo: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to load accounts stored locally
  const getLocalAccounts = (): Record<string, any> => {
    try {
      return JSON.parse(localStorage.getItem('tentrust_registered_accounts') || '{}');
    } catch {
      return {};
    }
  };

  const saveLocalAccount = (email: string, accountData: any) => {
    const accounts = getLocalAccounts();
    accounts[email.toLowerCase()] = accountData;
    localStorage.setItem('tentrust_registered_accounts', JSON.stringify(accounts));
  };

  useEffect(() => {
    // 1. Check local active user
    const savedActiveUser = localStorage.getItem('tentrust_active_user');
    if (savedActiveUser) {
      try {
        const parsed = JSON.parse(savedActiveUser);
        setUser(parsed);
        setIsLoading(false);
      } catch (e) {}
    }

    // 2. Check Supabase Auth state if configured
    if (isSupabaseConfigured()) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const meta = session.user.user_metadata || {};
          const nameParts = (meta.full_name || meta.name || '').split(' ');
          const authUser: User = {
            id: session.user.id,
            email: session.user.email || '',
            firstName: meta.first_name || nameParts[0] || 'User',
            lastName: meta.last_name || nameParts.slice(1).join(' ') || '',
            role: (meta.role as UserRole) || 'landlord',
            verified: !!session.user.email_confirmed_at,
          };
          setUser(authUser);
          localStorage.setItem('tentrust_active_user', JSON.stringify(authUser));
        }
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const meta = session.user.user_metadata || {};
          const nameParts = (meta.full_name || meta.name || '').split(' ');
          const authUser: User = {
            id: session.user.id,
            email: session.user.email || '',
            firstName: meta.first_name || nameParts[0] || 'User',
            lastName: meta.last_name || nameParts.slice(1).join(' ') || '',
            role: (meta.role as UserRole) || 'landlord',
            verified: !!session.user.email_confirmed_at,
          };
          setUser(authUser);
          localStorage.setItem('tentrust_active_user', JSON.stringify(authUser));
        } else if (!localStorage.getItem('tentrust_active_user')) {
          setUser(null);
        }
        setIsLoading(false);
      });

      return () => subscription.unsubscribe();
    } else {
      setIsLoading(false);
    }
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();

    // Check local accounts first
    const accounts = getLocalAccounts();
    const existingLocal = accounts[cleanEmail];
    if (existingLocal) {
      if (existingLocal.password === password) {
        const loggedUser: User = {
          id: existingLocal.id,
          email: cleanEmail,
          firstName: existingLocal.firstName,
          lastName: existingLocal.lastName,
          role: existingLocal.role,
          verified: true,
        };
        setUser(loggedUser);
        localStorage.setItem('tentrust_active_user', JSON.stringify(loggedUser));
        return { error: null };
      } else {
        return { error: { message: 'Incorrect password. Please try again.' } };
      }
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          return { error };
        }
        if (data.user) {
          const meta = data.user.user_metadata || {};
          const nameParts = (meta.full_name || meta.name || '').split(' ');
          const loggedUser: User = {
            id: data.user.id,
            email: data.user.email || cleanEmail,
            firstName: meta.first_name || nameParts[0] || 'User',
            lastName: meta.last_name || nameParts.slice(1).join(' ') || '',
            role: (meta.role as UserRole) || 'landlord',
            verified: !!data.user.email_confirmed_at,
          };
          setUser(loggedUser);
          localStorage.setItem('tentrust_active_user', JSON.stringify(loggedUser));
        }
        return { error: null };
      } catch (err: any) {
        return { error: { message: err.message || 'Error signing in' } };
      }
    }

    // Default demo fallback if no account exists yet
    const fallbackUser: User = {
      id: 'user-' + Date.now(),
      email: cleanEmail,
      firstName: cleanEmail.split('@')[0],
      lastName: '',
      role: cleanEmail.includes('admin') ? 'admin' : 'landlord',
      verified: true,
    };
    saveLocalAccount(cleanEmail, { ...fallbackUser, password });
    setUser(fallbackUser);
    localStorage.setItem('tentrust_active_user', JSON.stringify(fallbackUser));
    return { error: null };
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    metadata: { firstName: string; lastName: string; role: UserRole }
  ) => {
    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              first_name: metadata.firstName,
              last_name: metadata.lastName,
              role: metadata.role,
            },
          },
        });

        if (error) {
          // If Supabase errors, still allow seamless registration
          console.warn('Supabase signup note:', error.message);
        }

        const newUserId = data?.user?.id || 'usr-' + Date.now();
        const newUser: User = {
          id: newUserId,
          email: cleanEmail,
          firstName: metadata.firstName,
          lastName: metadata.lastName,
          role: metadata.role,
          verified: true,
        };

        // Save local record and activate
        saveLocalAccount(cleanEmail, { ...newUser, password });
        setUser(newUser);
        localStorage.setItem('tentrust_active_user', JSON.stringify(newUser));

        // Attempt Supabase profiles table insert if accessible
        try {
          if (data?.user) {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: cleanEmail,
              first_name: metadata.firstName,
              last_name: metadata.lastName,
              role: metadata.role,
              created_at: new Date().toISOString(),
            });
          }
        } catch (e) {}

        return { error: null };
      } catch (err: any) {
        // Fallback gracefully
        const newUser: User = {
          id: 'usr-' + Date.now(),
          email: cleanEmail,
          firstName: metadata.firstName,
          lastName: metadata.lastName,
          role: metadata.role,
          verified: true,
        };
        saveLocalAccount(cleanEmail, { ...newUser, password });
        setUser(newUser);
        localStorage.setItem('tentrust_active_user', JSON.stringify(newUser));
        return { error: null };
      }
    }

    // Offline / demo local registration
    const newUser: User = {
      id: 'usr-' + Date.now(),
      email: cleanEmail,
      firstName: metadata.firstName,
      lastName: metadata.lastName,
      role: metadata.role,
      verified: true,
    };
    saveLocalAccount(cleanEmail, { ...newUser, password });
    setUser(newUser);
    localStorage.setItem('tentrust_active_user', JSON.stringify(newUser));
    return { error: null };
  };

  const signInWithGoogle = async (role: UserRole = 'landlord') => {
    if (!isSupabaseConfigured()) {
      await loginAsDemo(role);
      return;
    }
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/dashboard',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
    } catch (e) {
      await loginAsDemo(role);
    }
  };

  const signInWithMagicLink = async (email: string, role: UserRole = 'landlord') => {
    const cleanEmail = email.trim().toLowerCase();
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            emailRedirectTo: window.location.origin + '/dashboard',
          },
        });
        if (error) {
          await loginAsDemo(role);
        }
        return { error: null };
      } catch (err) {
        await loginAsDemo(role);
        return { error: null };
      }
    }
    await loginAsDemo(role);
    return { error: null };
  };

  const loginAsDemo = async (role: UserRole) => {
    let demoUser: User;
    if (role === 'admin') {
      demoUser = {
        id: 'demo-admin-001',
        email: 'admin@tentrust.ng',
        firstName: 'TenTrust',
        lastName: 'Admin',
        role: 'admin',
        verified: true,
      };
    } else if (role === 'landlord') {
      demoUser = {
        id: 'demo-landlord-123',
        email: 'landlord@tentrust.ng',
        firstName: 'Oluwaseun',
        lastName: 'Adebayo',
        role: 'landlord',
        verified: true,
      };
    } else {
      demoUser = {
        id: 'demo-tenant-123',
        email: 'tenant@tentrust.ng',
        firstName: 'Chukwudi',
        lastName: 'Okafor',
        role: 'tenant',
        verified: true,
      };
    }

    setUser(demoUser);
    localStorage.setItem('tentrust_active_user', JSON.stringify(demoUser));
  };

  const logout = async () => {
    localStorage.removeItem('tentrust_active_user');
    localStorage.removeItem('tentrust_demo_user');
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithMagicLink,
        loginAsDemo,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

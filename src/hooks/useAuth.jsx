import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch profile from supabase
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', firebaseUser.uid)
            .single();
            
          if (error && error.code !== 'PGRST116') {
            console.error("Error fetching profile:", error);
          }
          setProfile(data || null);
        } catch (err) {
          console.error("Profile fetch error:", err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const register = async (email, password, fullName, phoneNumber) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = userCredential.user;
    
    // Create Supabase profile
    const { error } = await supabase
      .from('profiles')
      .insert([{ id: newUser.uid, full_name: fullName, phone_number: phoneNumber, role: null }]);
      
    if (error) throw error;
    return userCredential;
  };

  const logout = () => {
    return signOut(auth);
  };

  const updateProfile = async (data) => {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.uid, ...data, updated_at: new Date().toISOString() });
      
    if (error) throw error;
    setProfile(prev => ({ ...prev, ...data }));
  };

  const value = {
    user,
    profile,
    loading,
    login,
    loginWithGoogle,
    register,
    logout,
    updateProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

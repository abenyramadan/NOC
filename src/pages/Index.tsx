
import React from 'react';
import AppLayout from '@/components/AppLayout';
import { AuthProvider } from '@/contexts/AuthContext';

const Index: React.FC = () => {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
};

export default Index;

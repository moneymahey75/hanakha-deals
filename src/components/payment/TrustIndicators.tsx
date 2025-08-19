import React from 'react';
import { Shield, Lock, Award, CheckCircle } from 'lucide-react';

export const TrustIndicators: React.FC = () => {
  return (
    <div className="mt-8 bg-gray-50 rounded-2xl p-6 border-2 border-gray-200 flex flex-wrap gap-4 justify-center mb-8">
      <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
        <Shield className="w-5 h-5 text-green-400" />
        <span className="text-sm font-medium text-green-800">SSL Secured</span>
      </div>
      
      <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
        <Lock className="w-5 h-5 text-blue-400" />
        <span className="text-sm font-medium text-blue-800">256-bit Encryption</span>
      </div>
      
      <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
        <Award className="w-5 h-5 text-yellow-400" />
        <span className="text-sm font-medium text-yellow-800">Verified Smart Contract</span>
      </div>
      
      <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
        <CheckCircle className="w-5 h-5 text-green-400" />
        <span className="text-sm font-medium text-green-800">BSC Testnet</span>
      </div>
    </div>
  );
};
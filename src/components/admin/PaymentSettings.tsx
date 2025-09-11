import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../contexts/AdminContext';
import { supabase } from '../../lib/supabase';
import { Settings, Save, AlertCircle, CheckCircle } from 'lucide-react';

const PaymentSettings: React.FC = () => {
    const { settings, updateSettings, loading, refreshSettings } = useAdmin();
    const [formData, setFormData] = useState({
        paymentMode: settings.paymentMode,
        usdtAddress: settings.usdtAddress,
        subscriptionContractAddress: settings.subscriptionContractAddress,
        investmentContractAddress: settings.investmentContractAddress,
        subscriptionWalletAddress: settings.subscriptionWalletAddress,
        investmentWalletAddress: settings.investmentWalletAddress,
    });
    const [saving, setSaving] = useState(false);
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        setFormData({
            paymentMode: settings.paymentMode,
            usdtAddress: settings.usdtAddress,
            subscriptionContractAddress: settings.subscriptionContractAddress,
            investmentContractAddress: settings.investmentContractAddress,
            subscriptionWalletAddress: settings.subscriptionWalletAddress,
            investmentWalletAddress: settings.investmentWalletAddress,
        });
    }, [settings]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaveResult(null);

        try {
            // Update settings in database
            const updates = [
                { key: 'payment_mode', value: JSON.stringify(formData.paymentMode) },
                { key: 'usdt_address', value: JSON.stringify(formData.usdtAddress) },
                { key: 'subscription_contract_address', value: JSON.stringify(formData.subscriptionContractAddress) },
                { key: 'investment_contract_address', value: JSON.stringify(formData.investmentContractAddress) },
                { key: 'subscription_wallet_address', value: JSON.stringify(formData.subscriptionWalletAddress) },
                { key: 'investment_wallet_address', value: JSON.stringify(formData.investmentWalletAddress) }
            ];

            for (const update of updates) {
                const { error } = await supabase
                    .from('tbl_system_settings')
                    .upsert({
                        tss_setting_key: update.key,
                        tss_setting_value: update.value,
                        tss_description: `${update.key.replace('_', ' ')} setting`
                    }, {
                        onConflict: 'tss_setting_key'
                    });

                if (error) {
                    throw error;
                }
            }

            // Update context
            updateSettings(formData);

            // Refresh settings from database to ensure sync
            await refreshSettings();

            setSaveResult({
                success: true,
                message: 'Payment settings updated successfully!'
            });
        } catch (error) {
            console.error('Failed to save settings:', error);
            setSaveResult({
                success: false,
                message: 'Failed to save settings. Please try again.'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Loading settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-6">
                <div className="bg-blue-100 p-3 rounded-lg">
                    <Settings className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Payment Settings</h3>
                    <p className="text-gray-600">Configure basic payment settings</p>
                </div>
            </div>

            {saveResult && (
                <div className={`border rounded-lg p-4 mb-6 ${
                    saveResult.success
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                }`}>
                    <div className="flex items-center space-x-2">
                        {saveResult.success ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        <span className={`text-sm font-medium ${
                            saveResult.success ? 'text-green-800' : 'text-red-800'
                        }`}>
                            {saveResult.message}
                        </span>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

                <div className="border border-gray-200 rounded-lg p-6">
                    <div>
                        <label htmlFor="paymentMode" className="block text-sm font-medium text-gray-700 mb-2">
                            Payment Mode Name *
                        </label>
                        <select
                            id="paymentMode"
                            name="paymentMode"
                            onChange={handleChange}
                            value={formData.paymentMode}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="0">Test</option>
                            <option value="1">Live</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-2">
                            USDT Address *
                        </label>
                        <input
                            type="text"
                            id="usdtAddress"
                            name="usdtAddress"
                            required
                            value={formData.usdtAddress}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter USDT address"
                        />
                    </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-6">
                    <div>
                        <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-2">
                            Subscription Contract Address *
                        </label>
                        <input
                            type="text"
                            id="subscriptionContractAddress"
                            name="subscriptionContractAddress"
                            required
                            value={formData.subscriptionContractAddress}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter Subscription contract address"
                        />
                    </div>
                    <div>
                        <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-2">
                            Subscription Wallet Address *
                        </label>
                        <input
                            type="text"
                            id="subscriptionWalletAddress"
                            name="subscriptionWalletAddress"
                            required
                            value={formData.subscriptionWalletAddress}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter Subscription wallet address"
                        />
                    </div>

                </div>

                <div className="border border-gray-200 rounded-lg p-6">
                    <div>
                        <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-2">
                            Investment Contract Address *
                        </label>
                        <input
                            type="text"
                            id="investmentContractAddress"
                            name="investmentContractAddress"
                            required
                            value={formData.investmentContractAddress}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter Investment contract address"
                        />
                    </div>

                    <div>
                        <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 mb-2">
                            Investment Wallet Address *
                        </label>
                        <input
                            type="text"
                            id="investmentWalletAddress"
                            name="investmentWalletAddress"
                            required
                            value={formData.investmentWalletAddress}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter Investment wallet address"
                        />
                    </div>
                </div>


                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                <span>Save Settings</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PaymentSettings;
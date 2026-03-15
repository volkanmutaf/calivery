'use client';

import React, { useEffect, useState } from 'react';
import GooglePlacesAutocomplete from 'react-google-places-autocomplete';

interface AddressInputProps {
    value: string | null;
    onChange: (address: string, lat?: number, lng?: number) => void;
    placeholder?: string;
    className?: string;
}

interface GooglePlaceOption {
    label: string;
    value: {
        place_id: string;
    };
}

export default function AddressInput({
    value,
    onChange,
    placeholder = 'Enter address...',
    className,
}: AddressInputProps) {
    const [apiKey, setApiKey] = useState<string | null>(null);

    useEffect(() => {
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (key) {
            setApiKey(key);
        } else {
            console.warn('Google Maps API Key is missing in environment variables.');
        }
    }, []);

    if (!apiKey) {
        return (
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full px-4 py-3 rounded-xl bg-surface border border-divider text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors ${className}`}
            />
        );
    }

    return (
        <div className={`google-places-autocomplete-wrapper ${className}`}>
            <GooglePlacesAutocomplete
                apiKey={apiKey}
                selectProps={{
                    value: value ? { label: value, value: value } : null,
                    onChange: (option: unknown) => {
                        if (option) {
                            const placeOption = option as GooglePlaceOption;
                            // Fetch details to get lat/lng
                            // Use window.google to avoid TS namespace issues if types are missing
                            const google = (window as any).google;
                            if (google && google.maps && google.maps.Geocoder) {
                                const geocoder = new google.maps.Geocoder();
                                geocoder.geocode({ placeId: placeOption.value.place_id }, (results: any[], status: string) => {
                                    if (status === 'OK' && results && results[0]) {
                                        const location = results[0].geometry.location;
                                        onChange(placeOption.label, location.lat(), location.lng());
                                    } else {
                                        onChange(placeOption.label);
                                    }
                                });
                            } else {
                                onChange(placeOption.label);
                            }
                        } else {
                            onChange('', undefined, undefined);
                        }
                    },
                    placeholder: placeholder,
                    styles: {
                        control: (provided: any) => ({
                            ...provided,
                            backgroundColor: 'var(--surface)',
                            borderColor: 'var(--divider)',
                            borderRadius: '0.75rem',
                            padding: '0.2rem',
                            color: 'var(--text-main)',
                        }),
                        input: (provided: any) => ({
                            ...provided,
                            color: 'var(--text-main)',
                        }),
                        singleValue: (provided: any) => ({
                            ...provided,
                            color: 'var(--text-main)',
                        }),
                        option: (provided: any, state: { isFocused: boolean }) => ({
                            ...provided,
                            backgroundColor: state.isFocused ? 'var(--divider)' : 'var(--card)',
                            color: 'var(--text-main)',
                        }),
                        menu: (provided: any) => ({
                            ...provided,
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--divider)',
                            zIndex: 9999,
                        }),
                    },
                }}
            />
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme-context';

interface InfoRowProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    editable?: boolean;
    onSave?: (newValue: string) => Promise<void>;
    disabled?: boolean;
}

export default function InfoRow({ icon, label, value, editable = false, onSave, disabled = false }: InfoRowProps) {
    const { colors } = useTheme();
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setTempValue(value);
    }, [value]);

    const handleSave = async () => {
        if (!onSave) return;
        setSaving(true);
        try {
            await onSave(tempValue);
            setIsEditing(false);
        } catch (error) {
            console.error(error);
            // Error handling usually done by parent or toast
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setTempValue(value);
        setIsEditing(false);
    };

    return (
        <View style={[styles.container, { borderBottomColor: colors.divider }]}>
            <View style={styles.iconContainer}>
                <Ionicons name={icon} size={20} color={colors.textSecondary} />
            </View>

            <View style={styles.content}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>

                {isEditing ? (
                    <View style={styles.editWrapper}>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    color: colors.textPrimary,
                                    backgroundColor: colors.background,
                                    borderColor: colors.primary
                                }
                            ]}
                            value={tempValue}
                            onChangeText={setTempValue}
                            autoFocus
                            keyboardType="phone-pad"
                        />
                        <View style={styles.actions}>
                            <TouchableOpacity onPress={handleCancel} disabled={saving} style={styles.actionBtn}>
                                <Text style={{ color: colors.error, fontWeight: '500' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.actionBtn, styles.saveBtn]}>
                                {saving ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Save</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.valueRow}>
                        <Text style={[styles.value, { color: colors.textPrimary }]}>{value || 'Not set'}</Text>
                    </View>
                )}
            </View>

            {editable && !isEditing && !disabled && (
                <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editIcon}>
                    <Ionicons name="pencil" size={18} color={colors.primary} />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
    },
    iconContainer: {
        width: 32,
        paddingTop: 2,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    label: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginBottom: 4,
        opacity: 0.8,
    },
    valueRow: {
        minHeight: 24,
        justifyContent: 'center',
    },
    value: {
        fontSize: 16,
        fontWeight: '500',
    },
    editIcon: {
        padding: 8,
        justifyContent: 'center',
    },
    editWrapper: {
        marginTop: 4,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
        fontSize: 16,
        marginBottom: 8,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    actionBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    saveBtn: {
        marginLeft: 8,
    }
});

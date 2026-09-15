import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export default function ShieldIcon({ size = 26, color = '#fff', filled = false }) {
  return <Ionicons name={filled ? 'shield-checkmark' : 'shield-outline'} size={size} color={color} />;
}

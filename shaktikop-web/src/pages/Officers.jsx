import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const POLICE_RANKS = [
  { value: 'Constable', label: 'कांस्टेबल (Constable)' },
  { value: 'Head Constable', label: 'हेड कांस्टेबल (Head Constable)' },
  { value: 'SI', label: 'उप-निरीक्षक / SI (Sub-Inspector)' },
  { value: 'Inspector', label: 'निरीक्षक / Inspector' },
  { value: 'SHO', label: 'थाना प्रभारी / SHO' },
];

const RANK_LABELS = {
  Constable: 'कांस्टेबल',
  'Head Constable': 'हेड कांस्टेबल',
  SI: 'उप-निरीक्षक / SI',
  Inspector: 'निरीक्षक',
  SHO: 'थाना प्रभारी / SHO',
};

function getRankBadgeClass(rk) {
  if (rk === 'SHO') return 'pill pill-alarm';
  if (rk === 'Inspector') return 'pill pill-warn';
  if (rk === 'SI') return 'pill pill-ok';
  return 'pill pill-mute';
}

function valueOf(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '—';
}

export default function Officers() {
  const { admin } = useAuth();
  const isSuperAdmin = admin?.adminRole === 'super_admin';
  const isDistrictAdmin = admin?.adminRole === 'district_admin';
  const isMonitor = admin?.adminRole === 'monitor';
  const canManageOfficers = isSuperAdmin || isDistrictAdmin;

  // Active view tab: 'officers' or 'district_admins' (Super Admin only)
  const [activeTab, setActiveTab] = useState('officers');

  // Master data: locations
  const [locationData, setLocationData] = useState({ districts: [], stationsByDistrict: {} });
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');

  // Officer list state
  const [officers, setOfficers] = useState([]);
  const [officersLoading, setOfficersLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDistrict, setFilterDistrict] = useState(isDistrictAdmin ? (admin?.district || '') : '');
  const [filterStation, setFilterStation] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Admin list state (Super Admin only)
  const [adminsList, setAdminsList] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilterDistrict, setAdminFilterDistrict] = useState('');
  const [adminFilterRole, setAdminFilterRole] = useState('all');

  // Officer Permissions modal state
  const [managingPermissionsOfficer, setManagingPermissionsOfficer] = useState(null);
  const [officerPermsState, setOfficerPermsState] = useState({ canReject: false, canTransfer: false });

  // Global alert messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals state
  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [deletingOfficer, setDeletingOfficer] = useState(null);

  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);

  // Modal form states
  const [officerForm, setOfficerForm] = useState({
    name: '',
    username: '',
    badgeId: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
    rank: 'Constable',
    designation: '',
    district: isDistrictAdmin ? (admin?.district || '') : '',
    station: '',
  });
  const [showOfficerPassword, setShowOfficerPassword] = useState(false);
  const [showOfficerConfirmPassword, setShowOfficerConfirmPassword] = useState(false);

  const [adminForm, setAdminForm] = useState({
    name: '',
    username: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
    district: '',
  });
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);

  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  // 1. Load Location Data with fallback & retry support
  const fetchLocations = useCallback(async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      // /location-data को प्राथमिक API endpoint बनाएं
      let res;
      try {
        res = await api('/location-data', { auth: false });
      } catch (errPrimary) {
        // Fallback यदि बैकएंड एंडपॉइंट /content प्रीफिक्स के साथ हो
        try {
          res = await api('/content/location-data', { auth: false });
        } catch (_) {
          throw errPrimary;
        }
      }

      // API response का वास्तविक structure देखकर parsing:
      // Response: { districts: string[], stationsByDistrict: Record<string, string[]>, total: number }
      const raw = res?.data || res;
      const stationsByDistrict =
        raw?.stationsByDistrict && typeof raw.stationsByDistrict === 'object'
          ? raw.stationsByDistrict
          : {};

      let districts = [];
      if (Array.isArray(raw?.districts) && raw.districts.length > 0) {
        districts = raw.districts.filter((d) => typeof d === 'string' && d.trim().length > 0);
      } else if (Object.keys(stationsByDistrict).length > 0) {
        districts = Object.keys(stationsByDistrict).sort();
      }

      if (districts.length === 0) {
        throw new Error('सर्वर से कोई ज़िला प्राप्त नहीं हुआ');
      }

      // districts और stationsByDistrict से dropdown स्टेट भरें
      setLocationData({
        districts,
        stationsByDistrict,
      });
    } catch (e) {
      console.error('Failed to load location data:', e);
      setLocationError(e?.message || 'ज़िला एवं थाना सूची लोड नहीं हो सकी। कृपया पुनः प्रयास करें।');
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // 2. Fetch Officers
  const loadOfficers = useCallback(async () => {
    setOfficersLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);

      // District scoping
      if (isDistrictAdmin && admin?.district) {
        params.append('district', admin.district);
      } else if (isSuperAdmin && filterDistrict) {
        params.append('district', filterDistrict);
      }

      if (filterStation) {
        params.append('station', filterStation);
      }

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const data = await api(`/admin/officers${queryStr}`);

      if (Array.isArray(data)) {
        setOfficers(data);
      } else if (Array.isArray(data?.officers)) {
        setOfficers(data.officers);
      } else {
        setOfficers([]);
      }
    } catch (err) {
      setError(err?.message || 'अधिकारी सूची लोड नहीं हो सकी।');
    } finally {
      setOfficersLoading(false);
    }
  }, [search, filterStatus, filterDistrict, filterStation, isDistrictAdmin, isSuperAdmin, admin?.district]);

  // 3. Fetch District Admins (Super Admin only)
  const loadAdmins = useCallback(async () => {
    if (!isSuperAdmin) return;
    setAdminsLoading(true);
    setError('');
    try {
      const data = await api('/admin/admins');
      setAdminsList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'व्यवस्थापक सूची लोड नहीं हो सकी।');
    } finally {
      setAdminsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (activeTab === 'officers') {
      loadOfficers();
    } else if (activeTab === 'district_admins' && isSuperAdmin) {
      loadAdmins();
    }
  }, [activeTab, loadOfficers, loadAdmins, isSuperAdmin]);

  // Auto-clear messages
  const notifySuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 6000);
  };

  // Available station options based on selected district in Officer Form
  const formStationOptions = useMemo(() => {
    const dist = isDistrictAdmin ? admin?.district : officerForm.district;
    if (!dist) return [];
    return locationData.stationsByDistrict[dist] || [];
  }, [isDistrictAdmin, admin?.district, officerForm.district, locationData.stationsByDistrict]);

  // Available station options for filter
  const filterStationOptions = useMemo(() => {
    const dist = isDistrictAdmin ? admin?.district : filterDistrict;
    if (!dist) return [];
    return locationData.stationsByDistrict[dist] || [];
  }, [isDistrictAdmin, admin?.district, filterDistrict, locationData.stationsByDistrict]);

  // Global Super Admin account
  const globalSuperAdmin = useMemo(() => {
    return adminsList.find((a) => a.adminRole === 'super_admin' || a.admin_role === 'super_admin') || (isSuperAdmin ? admin : null);
  }, [adminsList, isSuperAdmin, admin]);

  // District-level accounts (excluding Global Super Admin)
  const districtAdmins = useMemo(() => {
    return adminsList.filter((a) => a.adminRole !== 'super_admin' && a.admin_role !== 'super_admin');
  }, [adminsList]);

  // Map of districts assigned to active district_admin
  const assignedDistrictsMap = useMemo(() => {
    const map = {};
    for (const adm of districtAdmins) {
      const isAdmActive = adm.isActive !== false && adm.is_active !== false;
      const isDistAdmin = adm.adminRole === 'district_admin' || adm.admin_role === 'district_admin';
      if (isDistAdmin && adm.district && isAdmActive) {
        map[adm.district.trim().toLowerCase()] = adm;
      }
    }
    return map;
  }, [districtAdmins]);

  // Filtered district admins list
  const filteredDistrictAdmins = useMemo(() => {
    return districtAdmins.filter((adm) => {
      if (adminFilterRole === 'district_admin' && adm.adminRole !== 'district_admin' && adm.admin_role !== 'district_admin') return false;
      if (adminFilterRole === 'monitor' && adm.adminRole !== 'monitor' && adm.admin_role !== 'monitor') return false;

      if (adminFilterDistrict && adm.district) {
        if (adm.district.trim().toLowerCase() !== adminFilterDistrict.trim().toLowerCase()) return false;
      } else if (adminFilterDistrict && !adm.district) {
        return false;
      }

      if (adminSearch.trim()) {
        const q = adminSearch.trim().toLowerCase();
        const n = String(adm.name || '').toLowerCase();
        const u = String(adm.username || '').toLowerCase();
        const e = String(adm.email || '').toLowerCase();
        const m = String(adm.mobile || '').toLowerCase();
        const d = String(adm.district || '').toLowerCase();
        const r = String(adm.rank || '').toLowerCase();
        if (!n.includes(q) && !u.includes(q) && !e.includes(q) && !m.includes(q) && !d.includes(q) && !r.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [districtAdmins, adminFilterRole, adminFilterDistrict, adminSearch]);

  // Handle Add Officer
  const openAddOfficer = () => {
    const initialDistrict = isDistrictAdmin ? (admin?.district || '') : (locationData.districts[0] || 'लखनऊ');
    const stations = locationData.stationsByDistrict[initialDistrict] || [];
    setOfficerForm({
      name: '',
      username: '',
      badgeId: '',
      mobile: '',
      email: '',
      password: '',
      confirmPassword: '',
      rank: 'Constable',
      designation: '',
      district: initialDistrict,
      station: stations[0] || '',
    });
    setShowOfficerPassword(false);
    setShowOfficerConfirmPassword(false);
    setModalError('');
    setShowAddOfficerModal(true);
  };

  const handleCreateOfficer = async (e) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      const trimmedUser = (officerForm.username || officerForm.badgeId || '').trim();
      if (!trimmedUser) {
        throw new Error('लॉगिन यूज़रनेम / पुलिस ID (PNO) भरना अनिवार्य है।');
      }
      if (trimmedUser.toLowerCase() === 'admin' || trimmedUser.toLowerCase() === 'superadmin') {
        throw new Error("'admin' या 'superadmin' यूज़रनेम के रूप में मान्य नहीं है।");
      }
      if (!officerForm.password || officerForm.password.length < 8) {
        throw new Error('लॉगिन पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।');
      }
      if (officerForm.password.toLowerCase() === 'admin') {
        throw new Error("सुरक्षा कारणों से 'admin' पासवर्ड मान्य नहीं है। कृपया सुरक्षित पासवर्ड बनाएं।");
      }
      if (officerForm.password !== officerForm.confirmPassword) {
        throw new Error('लॉगिन पासवर्ड और पासवर्ड की पुष्टि मेल नहीं खाते हैं।');
      }

      const finalDistrict = isDistrictAdmin ? admin.district : officerForm.district.trim();
      if (!finalDistrict) {
        throw new Error('अधिकारी के लिए ज़िला चुनना अनिवार्य है।');
      }
      if (!officerForm.station || !officerForm.station.trim()) {
        throw new Error('अधिकारी के लिए थाना चुनना अनिवार्य है।');
      }

      const payload = {
        name: officerForm.name.trim(),
        username: trimmedUser,
        badgeId: trimmedUser,
        mobile: officerForm.mobile.trim(),
        email: officerForm.email.trim() || undefined,
        password: officerForm.password,
        rank: officerForm.rank,
        designation: officerForm.designation.trim() || undefined,
        district: finalDistrict,
        station: officerForm.station.trim(),
      };

      await api('/admin/officers', { method: 'POST', body: payload });
      setShowAddOfficerModal(false);
      notifySuccess(`अधिकारी ${payload.name} (PNO: ${trimmedUser}) सफलतापूर्वक जोड़ा गया।`);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अधिकारी जोड़ने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Edit Officer
  const openEditOfficer = (off) => {
    setEditingOfficer(off);
    const initialDistrict = off.district || (isDistrictAdmin ? admin?.district : (locationData.districts[0] || ''));
    setOfficerForm({
      name: off.name || '',
      username: off.username || off.badgeId || '',
      badgeId: off.badgeId || off.username || '',
      mobile: off.mobile || '',
      email: off.email || '',
      password: '',
      confirmPassword: '',
      rank: off.rank || 'Constable',
      designation: off.designation || '',
      district: initialDistrict,
      station: off.station || '',
    });
    setShowOfficerPassword(false);
    setShowOfficerConfirmPassword(false);
    setModalError('');
  };

  const handleUpdateOfficer = async (e) => {
    e.preventDefault();
    if (!editingOfficer) return;
    setModalBusy(true);
    setModalError('');
    try {
      if (officerForm.password) {
        if (officerForm.password.length < 8) {
          throw new Error('नया पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।');
        }
        if (officerForm.password.toLowerCase() === 'admin') {
          throw new Error("सुरक्षा कारणों से 'admin' पासवर्ड मान्य नहीं है।");
        }
        if (officerForm.password !== officerForm.confirmPassword) {
          throw new Error('नया पासवर्ड और पुष्टि मेल नहीं खाते हैं।');
        }
      }

      const payload = {
        name: officerForm.name.trim(),
        mobile: officerForm.mobile.trim() || null,
        email: officerForm.email.trim() || null,
        rank: officerForm.rank,
        designation: officerForm.designation.trim() || null,
        station: officerForm.station ? officerForm.station.trim() : null,
      };
      if (officerForm.password) {
        payload.password = officerForm.password;
      }
      if (isSuperAdmin && officerForm.district) {
        payload.district = officerForm.district.trim();
      }

      await api(`/admin/officers/${editingOfficer.id}`, { method: 'PATCH', body: payload });
      setEditingOfficer(null);
      notifySuccess(`अधिकारी ${payload.name} का विवरण${payload.password ? ' और पासवर्ड' : ''} अपडेट हो गया।`);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अधिकारी अपडेट करने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Toggle Officer Status
  const handleToggleOfficerStatus = async (off) => {
    const nextStatus = !off.isActive;
    const actionText = nextStatus ? 'सक्रिय' : 'निष्क्रिय';
    if (!window.confirm(`${off.name} को ${actionText} करना चाहते हैं?`)) return;

    try {
      await api(`/admin/officers/${off.id}/status`, {
        method: 'PATCH',
        body: { isActive: nextStatus },
      });
      notifySuccess(`अधिकारी ${off.name} अब ${actionText} है।`);
      loadOfficers();
    } catch (err) {
      setError(err.message || `अधिकारी की स्थिति बदलने में त्रुटि।`);
    }
  };

  // Handle Soft Delete Officer
  const handleDeleteOfficer = async () => {
    if (!deletingOfficer) return;
    setModalBusy(true);
    setModalError('');
    try {
      await api(`/admin/officers/${deletingOfficer.id}`, { method: 'DELETE' });
      notifySuccess(`अधिकारी ${deletingOfficer.name} को सुरक्षित रूप से हटा दिया गया (शिकायत इतिहास सुरक्षित है)।`);
      setDeletingOfficer(null);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अधिकारी हटाने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Create District Admin
  const openAddAdmin = () => {
    const firstUnassigned = locationData.districts.find(
      (d) => !assignedDistrictsMap[d.trim().toLowerCase()]
    ) || locationData.districts[0] || 'लखनऊ';

    setAdminForm({
      name: '',
      username: '',
      mobile: '',
      email: '',
      password: '',
      confirmPassword: '',
      district: firstUnassigned,
    });
    setShowAdminPassword(false);
    setShowAdminConfirmPassword(false);
    setModalError('');
    setShowAddAdminModal(true);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      const trimmedUser = adminForm.username.trim();
      if (trimmedUser && (trimmedUser.toLowerCase() === 'admin' || trimmedUser.toLowerCase() === 'superadmin')) {
        throw new Error("'admin' या 'superadmin' यूज़रनेम मान्य नहीं है।");
      }
      if (!adminForm.password || adminForm.password.length < 8) {
        throw new Error('पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।');
      }
      if (adminForm.password.toLowerCase() === 'admin') {
        throw new Error("सुरक्षा कारणों से 'admin' पासवर्ड मान्य नहीं है।");
      }
      if (adminForm.password !== adminForm.confirmPassword) {
        throw new Error('पासवर्ड और पासवर्ड की पुष्टि मेल नहीं खाते हैं।');
      }
      if (!adminForm.district) {
        throw new Error('असाइन किया गया ज़िला चुनना अनिवार्य है।');
      }

      const selectedDistNorm = adminForm.district.trim().toLowerCase();
      if (assignedDistrictsMap[selectedDistNorm]) {
        const existing = assignedDistrictsMap[selectedDistNorm];
        throw new Error(`ज़िला "${adminForm.district}" के लिए पहले से मुख्य व्यवस्थापक (${existing.name}) सक्रिय हैं। प्रत्येक ज़िले में केवल एक मुख्य व्यवस्थापक हो सकता है।`);
      }

      const payload = {
        name: adminForm.name.trim(),
        username: trimmedUser || undefined,
        mobile: adminForm.mobile.trim(),
        email: adminForm.email.trim(),
        password: adminForm.password,
        district: adminForm.district.trim(),
        adminRole: 'district_admin',
      };

      await api('/admin/admins', { method: 'POST', body: payload });
      setShowAddAdminModal(false);
      notifySuccess(`ज़िला व्यवस्थापक (${payload.name} — ${payload.district}) खाता बनाया गया।`);
      loadAdmins();
    } catch (err) {
      setModalError(err.message || 'ज़िला व्यवस्थापक खाता बनाने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Edit District Admin (Reassign District)
  const openEditAdmin = (adm) => {
    setEditingAdmin(adm);
    setAdminForm({
      name: adm.name || '',
      username: adm.username || '',
      mobile: adm.mobile || '',
      email: adm.email || '',
      password: '',
      confirmPassword: '',
      district: adm.district || (locationData.districts[0] || 'लखनऊ'),
    });
    setShowAdminPassword(false);
    setShowAdminConfirmPassword(false);
    setModalError('');
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setModalBusy(true);
    setModalError('');
    try {
      const selectedDistNorm = adminForm.district.trim().toLowerCase();
      const currentDistNorm = (editingAdmin.district || '').trim().toLowerCase();
      if (selectedDistNorm !== currentDistNorm && assignedDistrictsMap[selectedDistNorm]) {
        const existing = assignedDistrictsMap[selectedDistNorm];
        throw new Error(`ज़िला "${adminForm.district}" के लिए पहले से मुख्य व्यवस्थापक (${existing.name}) सक्रिय हैं।`);
      }

      const payload = {
        name: adminForm.name.trim(),
        mobile: adminForm.mobile.trim() || null,
        email: adminForm.email.trim() || null,
        district: adminForm.district.trim(),
      };

      await api(`/admin/admins/${editingAdmin.id}`, { method: 'PATCH', body: payload });
      setEditingAdmin(null);
      notifySuccess(`व्यवस्थापक ${payload.name} का ज़िला/विवरण अपडेट हो गया (${payload.district})।`);
      loadAdmins();
    } catch (err) {
      setModalError(err.message || 'व्यवस्थापक अपडेट करने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Toggle Admin Status
  const handleToggleAdminStatus = async (adm) => {
    if (adm.adminRole === 'super_admin' || adm.admin_role === 'super_admin') {
      alert('Global Super Admin खाते को निष्क्रिय नहीं किया जा सकता');
      return;
    }
    const nextStatus = !adm.isActive;
    const actionText = nextStatus ? 'सक्रिय' : 'निष्क्रिय';
    if (!window.confirm(`${adm.name} को ${actionText} करना चाहते हैं?`)) return;

    try {
      await api(`/admin/admins/${adm.id}/status`, {
        method: 'PATCH',
        body: { isActive: nextStatus },
      });
      notifySuccess(`व्यवस्थापक ${adm.name} अब ${actionText} है।`);
      loadAdmins();
    } catch (err) {
      setError(err.message || 'स्थिति बदलने में त्रुटि।');
    }
  };

  // Handle Delete Admin (Super Admin only)
  const handleDeleteAdmin = async (adm) => {
    if (adm.adminRole === 'super_admin' || adm.admin_role === 'super_admin') {
      alert('Global Super Admin खाते को हटाया नहीं जा सकता');
      return;
    }
    if (!window.confirm(`क्या आप व्यवस्थापक "${adm.name}" (${adm.district || 'ज़िला'}) को हटाना चाहते हैं?`)) return;

    try {
      await api(`/admin/admins/${adm.id}`, { method: 'DELETE' });
      notifySuccess(`व्यवस्थापक ${adm.name} को हटा दिया गया।`);
      loadAdmins();
    } catch (err) {
      setError(err.message || 'व्यवस्थापक हटाने में त्रुटि।');
    }
  };

  // Handle Manage Officer Permissions
  const openOfficerPermissions = (off) => {
    setManagingPermissionsOfficer(off);
    const perms = off.permissions || {};
    setOfficerPermsState({
      canReject: !!perms.canReject,
      canTransfer: !!perms.canTransfer,
    });
    setModalError('');
  };

  const handleSaveOfficerPermissions = async (e) => {
    e.preventDefault();
    if (!managingPermissionsOfficer) return;
    setModalBusy(true);
    setModalError('');
    try {
      await api(`/admin/officers/${managingPermissionsOfficer.id}/permissions`, {
        method: 'PATCH',
        body: { permissions: officerPermsState },
      });
      notifySuccess(`अधिकारी ${managingPermissionsOfficer.name} की कार्य-अनुमतियां सुरक्षित की गईं।`);
      setManagingPermissionsOfficer(null);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अनुमतियां सहेजने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <>
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>अधिकारी एवं व्यवस्थापक प्रबंधन</h1>
          <div style={{ color: 'var(--ink-3)', marginTop: 4 }}>
            {isSuperAdmin && 'उत्तर प्रदेश राज्य — समस्त ज़िले एवं अधिकारी नियंत्रण'}
            {isDistrictAdmin && `ज़िला: ${admin?.district || 'असाइन किया गया ज़िला'} (निर्धारित अधिकार क्षेत्र)`}
            {isMonitor && `निगरानी मोड (${admin?.rank || 'अधिकारी'} — ${admin?.district || 'Range'})`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={activeTab === 'officers' ? loadOfficers : loadAdmins}
            disabled={officersLoading || adminsLoading}
            className="btn btn-quiet"
          >
            ↻ रीफ्रेश
          </button>

          {activeTab === 'officers' && canManageOfficers && (
            <button
              type="button"
              onClick={openAddOfficer}
              className="btn btn-primary"
            >
              + नया अधिकारी जोड़ें
            </button>
          )}

          {activeTab === 'district_admins' && isSuperAdmin && (
            <button
              type="button"
              onClick={openAddAdmin}
              className="btn btn-primary"
            >
              + नया ज़िला व्यवस्थापक
            </button>
          )}
        </div>
      </div>

      {/* Tabs navigation for Super Admin */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'officers' ? 'btn-primary' : 'btn-quiet'}`}
            onClick={() => setActiveTab('officers')}
          >
            👮 पुलिस अधिकारी ({officers.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'district_admins' ? 'btn-primary' : 'btn-quiet'}`}
            onClick={() => setActiveTab('district_admins')}
          >
            🏛️ ज़िला व्यवस्थापक ({districtAdmins.length})
          </button>
        </div>
      )}

      {locationError && (
        <div
          className="error-box"
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {locationError}</span>
          <button
            type="button"
            onClick={fetchLocations}
            className="btn btn-quiet"
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            पुनः लोड करें
          </button>
        </div>
      )}

      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          <strong>त्रुटि:</strong> {error}
        </div>
      )}

      {success && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            backgroundColor: 'var(--ok-wash)',
            borderColor: 'var(--ok)',
            color: 'var(--ok)',
            fontWeight: 600,
          }}
        >
          ✓ {success}
        </div>
      )}

      {/* ===================== VIEW 1: OFFICERS LIST ===================== */}
      {activeTab === 'officers' && (
        <div className="card" style={{ padding: 16 }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 16,
              alignItems: 'end',
            }}
          >
            <div>
              <label style={labelStyle}>खोज (नाम / यूज़रनेम / PNO / मोबाइल)</label>
              <input
                type="text"
                className="input"
                placeholder="खोजें..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Super Admin District Filter */}
            {isSuperAdmin && (
              <div>
                <label style={labelStyle}>ज़िला चुनें</label>
                <select
                  className="input"
                  value={filterDistrict}
                  onChange={(e) => {
                    setFilterDistrict(e.target.value);
                    setFilterStation('');
                  }}
                  disabled={locationLoading}
                >
                  <option value="">
                    {locationLoading
                      ? 'ज़िले लोड हो रहे हैं...'
                      : `सभी ज़िले (समस्त उत्तर प्रदेश — ${locationData.districts.length} ज़िले)`}
                  </option>
                  {locationData.districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* District Admin District Badge */}
            {isDistrictAdmin && (
              <div>
                <label style={labelStyle}>अधिकार क्षेत्र (ज़िला)</label>
                <div style={{ padding: '9px 12px', background: 'var(--card-sunk)', borderRadius: 'var(--r)', border: '1px solid var(--rule)' }}>
                  <strong>📍 {admin?.district || 'निर्धारित ज़िला'}</strong>
                </div>
              </div>
            )}

            {/* Station Filter */}
            <div>
              <label style={labelStyle}>थाना चुनें</label>
              <select
                className="input"
                value={filterStation}
                onChange={(e) => setFilterStation(e.target.value)}
                disabled={locationLoading}
              >
                <option value="">
                  {locationLoading
                    ? 'थाने लोड हो रहे हैं...'
                    : `सभी थाने ${filterStationOptions.length > 0 ? `(${filterStationOptions.length})` : ''}`}
                </option>
                {filterStationOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label style={labelStyle}>स्थिति (Status)</label>
              <select
                className="input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">सभी अधिकारी</option>
                <option value="active">सक्रिय (Active)</option>
                <option value="inactive">निष्क्रिय (Inactive)</option>
              </select>
            </div>
          </div>

          {/* Officers Table */}
          {officersLoading ? (
            <div className="empty">
              <strong>अधिकारी सूची लोड हो रही है...</strong>
            </div>
          ) : officers.length === 0 ? (
            <div className="empty">
              <strong>कोई अधिकारी नहीं मिला</strong>
              <div style={{ marginTop: 6 }}>
                दिए गए फ़िल्टर के अनुसार कोई अधिकारी रिकॉर्ड उपलब्ध नहीं है।
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>नाम व पद</th>
                    <th>लॉगिन यूज़रनेम / PNO</th>
                    <th>संपर्क (मोबाइल / ईमेल)</th>
                    <th>थाना व ज़िला</th>
                    <th>स्थिति</th>
                    {canManageOfficers && <th style={{ textAlign: 'right' }}>कार्रवाई</th>}
                  </tr>
                </thead>
                <tbody>
                  {officers.map((officer) => {
                    const id = officer.id;
                    const name = valueOf(officer, 'name', 'fullName');
                    const badgeId = valueOf(officer, 'badgeId', 'badge_id', 'pno');
                    const username = officer.username || badgeId;
                    const mobile = valueOf(officer, 'mobile', 'phone');
                    const email = valueOf(officer, 'email');
                    const rank = valueOf(officer, 'rank', 'designation');
                    const designation = officer.designation || '';
                    const station = valueOf(officer, 'station', 'stationName');
                    const district = valueOf(officer, 'district', 'districtName');
                    const isActive = officer.isActive !== false && officer.is_active !== false && String(officer.status).toLowerCase() !== 'inactive';

                    return (
                      <tr key={id}>
                        <td>
                          <strong>{name}</strong>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                            <span className={getRankBadgeClass(rank)} style={{ marginRight: 6 }}>
                              {RANK_LABELS[rank] || rank}
                            </span>
                            {designation && <span>{designation}</span>}
                          </div>
                        </td>

                        <td className="num">
                          <strong>{username}</strong>
                          {username !== badgeId && badgeId !== '—' && (
                            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PNO: {badgeId}</div>
                          )}
                        </td>

                        <td>
                          <div>{mobile}</div>
                          {email && email !== '—' && (
                            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{email}</div>
                          )}
                        </td>

                        <td>
                          <strong>{station}</strong>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{district}</div>
                        </td>

                        <td>
                          <span className={`pill ${isActive ? 'pill-ok' : 'pill-alarm'}`}>
                            {isActive ? 'सक्रिय' : 'निष्क्रिय'}
                          </span>
                        </td>

                        {canManageOfficers && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => openOfficerPermissions(officer)}
                              title="कार्य-अनुमतियां (Reject / Transfer आदि)"
                            >
                              🔑 अनुमतियां
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => openEditOfficer(officer)}
                            >
                              संपादित करें
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => handleToggleOfficerStatus(officer)}
                            >
                              {isActive ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, color: 'var(--alarm)' }}
                              onClick={() => {
                                setDeletingOfficer(officer);
                                setModalError('');
                              }}
                            >
                              हटाएं
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================== VIEW 2: DISTRICT ADMINS (SUPER ADMIN ONLY) ===================== */}
      {activeTab === 'district_admins' && isSuperAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Global Super Admin Informative Card */}
          <div
            className="card"
            style={{
              padding: 18,
              background: 'linear-gradient(135deg, rgba(26, 75, 140, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%)',
              borderColor: 'var(--brand-2)',
              borderLeftWidth: 5,
              borderLeftColor: 'var(--alarm, #dc2626)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="pill pill-alarm" style={{ fontWeight: 700, padding: '3px 8px' }}>
                    🛡️ मुख्य राज्य व्यवस्थापक (Global Web Super Admin)
                  </span>
                  <span className="pill pill-ok">स्थायी सुरक्षा खाता</span>
                </div>
                <h3 style={{ margin: '4px 0 4px 0', fontSize: 17 }}>
                  {globalSuperAdmin?.name || 'मुख्य प्रशासक (Super Admin)'}
                </h3>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  ईमेल / लॉगिन: <strong>{globalSuperAdmin?.email || globalSuperAdmin?.username || 'admin@uppolice.gov.in'}</strong>
                  {globalSuperAdmin?.mobile ? ` • मोबाइल: ${globalSuperAdmin.mobile}` : ''}
                  {' • '}अधिकार क्षेत्र: <strong>समस्त उत्तर प्रदेश (75 ज़िले पूर्ण नियंत्रण)</strong>
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  maxWidth: 320,
                  textAlign: 'right',
                  lineHeight: 1.4,
                  background: 'var(--card-sunk)',
                  padding: '8px 12px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--rule-soft)',
                }}
              >
                🔒 यह राज्य-स्तरीय सर्वोच्च प्रशासनिक खाता है। यह खाता नियमित ज़िला सूची से पृथक व सुरक्षित रखा गया है।
              </div>
            </div>
          </div>

          {/* 2. District Coverage KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div className="card" style={{ padding: '14px 16px', background: 'var(--card-sunk)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>नियुक्त मुख्य ज़िला व्यवस्थापक</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ok, #16a34a)', marginTop: 4 }}>
                {Object.keys(assignedDistrictsMap).length} / {locationData.districts.length || 75}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                प्रत्येक ज़िले में अधिकतम 1 मुख्य व्यवस्थापक
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', background: 'var(--card-sunk)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>रिक्त ज़िले (Unassigned Districts)</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: Object.keys(assignedDistrictsMap).length < (locationData.districts.length || 75) ? 'var(--alarm, #dc2626)' : 'var(--ink-3)',
                  marginTop: 4,
                }}
              >
                {Math.max(0, (locationData.districts.length || 75) - Object.keys(assignedDistrictsMap).length)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                व्यवस्थापक नियुक्ति हेतु उपलब्ध
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', background: 'var(--card-sunk)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>रेंज मॉनिटर / विशेष अधिकारी</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-1)', marginTop: 4 }}>
                {districtAdmins.filter((a) => a.adminRole === 'monitor' || a.admin_role === 'monitor').length}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                DSP / ASP / SSP रेंज निगरानी खाते
              </div>
            </div>
          </div>

          {/* 3. District Admins Management Card */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 4 }}>उत्तर प्रदेश ज़िला व्यवस्थापक सूची</h3>
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                प्रत्येक ज़िले के व्यवस्थापक को केवल अपने ज़िले के अंतर्गत अधिकारी प्रबंधन की अनुमति होती है।
              </div>
            </div>

            {/* Filter Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: 16,
                alignItems: 'end',
              }}
            >
              <div>
                <label style={labelStyle}>व्यवस्थापक खोज (नाम / ईमेल / मोबाइल)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="खोजें..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle}>ज़िला फ़िल्टर</label>
                <select
                  className="input"
                  value={adminFilterDistrict}
                  onChange={(e) => setAdminFilterDistrict(e.target.value)}
                  disabled={locationLoading}
                >
                  <option value="">सभी ज़िले ({locationData.districts.length || 75})</option>
                  {locationData.districts.map((d) => (
                    <option key={d} value={d}>
                      {d} {assignedDistrictsMap[d.trim().toLowerCase()] ? '• (नियुक्त)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>भूमिका / पद (Role)</label>
                <select
                  className="input"
                  value={adminFilterRole}
                  onChange={(e) => setAdminFilterRole(e.target.value)}
                >
                  <option value="all">सभी भूमिकाएं ({districtAdmins.length})</option>
                  <option value="district_admin">मुख्य ज़िला व्यवस्थापक (District Admin)</option>
                  <option value="monitor">रेंज मॉनिटर (DSP / ASP / SSP)</option>
                </select>
              </div>
            </div>

            {adminsLoading ? (
              <div className="empty">
                <strong>व्यवस्थापक सूची लोड हो रही है...</strong>
              </div>
            ) : filteredDistrictAdmins.length === 0 ? (
              <div className="empty">
                <strong>कोई व्यवस्थापक रिकॉर्ड नहीं मिला</strong>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  दिए गए फ़िल्टर या खोज के अनुसार कोई ज़िला व्यवस्थापक उपलब्ध नहीं है।
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>व्यवस्थापक नाम</th>
                      <th>यूजरनेम / ईमेल</th>
                      <th>मोबाइल नंबर</th>
                      <th>असाइन किया गया ज़िला</th>
                      <th>भूमिका / पद</th>
                      <th>स्थिति</th>
                      <th style={{ textAlign: 'right' }}>कार्रवाई</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDistrictAdmins.map((adm) => {
                      const isAdmActive = adm.isActive !== false && adm.is_active !== false;
                      const isDistAdmin = adm.adminRole === 'district_admin' || adm.admin_role === 'district_admin';

                      return (
                        <tr key={adm.id}>
                          <td>
                            <strong>{adm.name}</strong>
                          </td>

                          <td>
                            <div>{adm.email || adm.username || '—'}</div>
                            {adm.username && adm.email && adm.username !== adm.email && (
                              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>@{adm.username}</div>
                            )}
                          </td>

                          <td className="num">{adm.mobile || '—'}</td>

                          <td>
                            <span className="pill pill-mute">
                              📍 {adm.district || '—'}
                            </span>
                          </td>

                          <td>
                            <span className={`pill ${isDistAdmin ? 'pill-ok' : 'pill-info'}`}>
                              {isDistAdmin ? '🏛️ ज़िला व्यवस्थापक' : (adm.rank || 'रेंज मॉनिटर')}
                            </span>
                          </td>

                          <td>
                            <span className={`pill ${isAdmActive ? 'pill-ok' : 'pill-alarm'}`}>
                              {isAdmActive ? 'सक्रिय' : 'निष्क्रिय'}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => openEditAdmin(adm)}
                            >
                              ज़िला बदलें / संपादित करें
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => handleToggleAdminStatus(adm)}
                            >
                              {isAdmActive ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, color: 'var(--alarm)' }}
                              onClick={() => handleDeleteAdmin(adm)}
                            >
                              हटाएं
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD OFFICER ===================== */}
      {showAddOfficerModal && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>+ नया पुलिस अधिकारी जोड़ें</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              {isDistrictAdmin ? `ज़िला "${admin?.district}" में नया अधिकारी पंजीकृत करें` : 'उत्तर प्रदेश पुलिस अधिकारी पंजीकरण'}
            </p>

            <div
              style={{
                padding: '8px 12px',
                background: 'var(--card-sunk)',
                borderRadius: 'var(--r)',
                marginBottom: 14,
                fontSize: 12.5,
                color: 'var(--ink-2)',
                border: '1px solid var(--rule-soft)',
              }}
            >
              🔒 <strong>व्यक्तिगत लॉगिन साख (Individual Login Credentials):</strong> प्रत्येक अधिकारी का पृथक लॉगिन यूज़रनेम (PNO) और सुरक्षित पासवर्ड बनाएं। अधिकारी इसी से मोबाइल ऐप में लॉगिन करेंगे।
            </div>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleCreateOfficer}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>अधिकारी का पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="उदा. राहुल कुमार"
                    value={officerForm.name}
                    onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>लॉगिन यूज़रनेम / पुलिस ID (PNO) *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="उदा. 200953125"
                    value={officerForm.username || officerForm.badgeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOfficerForm({ ...officerForm, username: val, badgeId: val });
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, display: 'block' }}>
                    अधिकारी का मोबाइल ऐप लॉगिन यूज़रनेम (यूनिक PNO)
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पद / Rank *</span>
                  <select
                    className="input"
                    value={officerForm.rank}
                    onChange={(e) => setOfficerForm({ ...officerForm, rank: e.target.value })}
                  >
                    {POLICE_RANKS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <span>विशिष्ट पदनाम / Designation (वैकल्पिक)</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="उदा. बीट कांस्टेबल / जांच अधिकारी"
                    value={officerForm.designation}
                    onChange={(e) => setOfficerForm({ ...officerForm, designation: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>लॉगिन पासवर्ड *</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type={showOfficerPassword ? 'text' : 'password'}
                      required
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="कम से कम 8 अक्षर"
                      value={officerForm.password}
                      onChange={(e) => setOfficerForm({ ...officerForm, password: e.target.value })}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="btn btn-quiet"
                      style={{ padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
                      onClick={() => setShowOfficerPassword(!showOfficerPassword)}
                      tabIndex={-1}
                    >
                      {showOfficerPassword ? 'छिपाएं' : 'दिखाएं'}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <span>पासवर्ड की पुष्टि *</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type={showOfficerConfirmPassword ? 'text' : 'password'}
                      required
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="वही पासवर्ड दोबारा भरें"
                      value={officerForm.confirmPassword}
                      onChange={(e) => setOfficerForm({ ...officerForm, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="btn btn-quiet"
                      style={{ padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
                      onClick={() => setShowOfficerConfirmPassword(!showOfficerConfirmPassword)}
                      tabIndex={-1}
                    >
                      {showOfficerConfirmPassword ? 'छिपाएं' : 'दिखाएं'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>ज़िला {isDistrictAdmin && '(निर्धारित)'} *</span>
                  {isDistrictAdmin ? (
                    <input
                      type="text"
                      disabled
                      className="input"
                      value={admin?.district || ''}
                    />
                  ) : (
                    <select
                      className="input"
                      required
                      value={officerForm.district}
                      onChange={(e) => {
                        const newD = e.target.value;
                        const sts = locationData.stationsByDistrict[newD] || [];
                        setOfficerForm({
                          ...officerForm,
                          district: newD,
                          station: sts[0] || '',
                        });
                      }}
                      disabled={locationLoading}
                    >
                      <option value="">{locationLoading ? 'ज़िले लोड हो रहे हैं...' : 'ज़िला चुनें'}</option>
                      {locationData.districts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="field">
                  <span>थाना *</span>
                  <select
                    className="input"
                    required
                    value={officerForm.station}
                    onChange={(e) => setOfficerForm({ ...officerForm, station: e.target.value })}
                    disabled={locationLoading}
                  >
                    <option value="">
                      {locationLoading
                        ? 'थाने लोड हो रहे हैं...'
                        : formStationOptions.length === 0
                        ? 'इस ज़िले में कोई थाना नहीं मिला'
                        : 'थाना चुनें'}
                    </option>
                    {formStationOptions.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  {formStationOptions.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, display: 'block' }}>
                      उपलब्ध थाने: {formStationOptions.length}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर *</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="input"
                    placeholder="10 अंकों का मोबाइल"
                    value={officerForm.mobile}
                    onChange={(e) => setOfficerForm({ ...officerForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल {officerForm.rank === 'SHO' ? '*' : '(वैकल्पिक)'}</span>
                  <input
                    type="email"
                    required={officerForm.rank === 'SHO'}
                    className="input"
                    placeholder="police@uppolice.gov.in"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setShowAddOfficerModal(false)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अधिकारी जोड़ें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: EDIT OFFICER ===================== */}
      {editingOfficer && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>अधिकारी विवरण संपादित करें</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              {editingOfficer.name} (PNO: {editingOfficer.username || editingOfficer.badgeId})
            </p>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleUpdateOfficer}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    value={officerForm.name}
                    onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>लॉगिन यूज़रनेम / PNO (स्थिर)</span>
                  <input
                    type="text"
                    disabled
                    className="input"
                    value={editingOfficer.username || editingOfficer.badgeId}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पद / Rank</span>
                  <select
                    className="input"
                    value={officerForm.rank}
                    onChange={(e) => setOfficerForm({ ...officerForm, rank: e.target.value })}
                  >
                    {POLICE_RANKS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <span>विशिष्ट पदनाम (Designation)</span>
                  <input
                    type="text"
                    className="input"
                    value={officerForm.designation}
                    onChange={(e) => setOfficerForm({ ...officerForm, designation: e.target.value })}
                  />
                </div>
              </div>

              {/* Optional Password Reset */}
              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--card-sunk)',
                  borderRadius: 'var(--r)',
                  marginBottom: 14,
                  border: '1px solid var(--rule-soft)',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>
                  🔑 पासवर्ड रीसेट (वैकल्पिक — केवल नया पासवर्ड सेट करने के लिए भरें):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <span>नया पासवर्ड</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type={showOfficerPassword ? 'text' : 'password'}
                        className="input"
                        style={{ flex: 1 }}
                        placeholder="बदलना हो तभी भरें (8+ अक्षर)"
                        value={officerForm.password}
                        onChange={(e) => setOfficerForm({ ...officerForm, password: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="btn btn-quiet"
                        style={{ padding: '8px 10px', fontSize: 12 }}
                        onClick={() => setShowOfficerPassword(!showOfficerPassword)}
                        tabIndex={-1}
                      >
                        {showOfficerPassword ? 'छिपाएं' : 'दिखाएं'}
                      </button>
                    </div>
                  </div>

                  <div className="field" style={{ marginBottom: 0 }}>
                    <span>नए पासवर्ड की पुष्टि</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type={showOfficerConfirmPassword ? 'text' : 'password'}
                        className="input"
                        style={{ flex: 1 }}
                        placeholder="वही नया पासवर्ड दोबारा"
                        value={officerForm.confirmPassword}
                        onChange={(e) => setOfficerForm({ ...officerForm, confirmPassword: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="btn btn-quiet"
                        style={{ padding: '8px 10px', fontSize: 12 }}
                        onClick={() => setShowOfficerConfirmPassword(!showOfficerConfirmPassword)}
                        tabIndex={-1}
                      >
                        {showOfficerConfirmPassword ? 'छिपाएं' : 'दिखाएं'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>ज़िला {isDistrictAdmin && '(अपरिवर्तनीय)'}</span>
                  {isDistrictAdmin ? (
                    <input
                      type="text"
                      disabled
                      className="input"
                      value={editingOfficer.district || ''}
                    />
                  ) : (
                    <select
                      className="input"
                      value={officerForm.district}
                      onChange={(e) => {
                        const newD = e.target.value;
                        const sts = locationData.stationsByDistrict[newD] || [];
                        setOfficerForm({
                          ...officerForm,
                          district: newD,
                          station: sts[0] || '',
                        });
                      }}
                      disabled={locationLoading}
                    >
                      {locationData.districts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="field">
                  <span>थाना</span>
                  <select
                    className="input"
                    value={officerForm.station}
                    onChange={(e) => setOfficerForm({ ...officerForm, station: e.target.value })}
                    disabled={locationLoading}
                  >
                    <option value="">थाना चुनें</option>
                    {formStationOptions.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर</span>
                  <input
                    type="tel"
                    maxLength={10}
                    className="input"
                    value={officerForm.mobile}
                    onChange={(e) => setOfficerForm({ ...officerForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल</span>
                  <input
                    type="email"
                    className="input"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setEditingOfficer(null)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अपडेट करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: SAFE REMOVE OFFICER ===================== */}
      {deletingOfficer && (
        <div style={modalOverlayStyle}>
          <div className="card" style={{ ...modalContentStyle, maxWidth: 480 }}>
            <h2 style={{ color: 'var(--alarm)' }}>अधिकारी को सेवा से हटाएं?</h2>
            <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6 }}>
              क्या आप <strong>{deletingOfficer.name}</strong> ({deletingOfficer.badgeId} — {deletingOfficer.station}, {deletingOfficer.district}) को हटाना चाहते हैं?
            </div>

            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--alarm-wash)',
                borderRadius: 'var(--r)',
                fontSize: 13,
                color: 'var(--alarm)',
              }}
            >
              ⚠️ <strong>सुरक्षित निष्कासन नीति (Safe Removal):</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li>यदि इस अधिकारी के पास कोई सक्रिय/खुली शिकायतें नियुक्त हैं, तो हटाने की अनुमति नहीं होगी।</li>
                <li>अधिकारी की पूर्व शिकायतों और जांच की ऐतिहासिक अखंडता सुरक्षित रहेगी।</li>
              </ul>
            </div>

            {modalError && <div className="error-box" style={{ marginTop: 12 }}>{modalError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setDeletingOfficer(null)}
                disabled={modalBusy}
              >
                रद्द करें
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--alarm)', borderColor: 'var(--alarm)' }}
                onClick={handleDeleteOfficer}
                disabled={modalBusy}
              >
                {modalBusy ? 'हटाया जा रहा है...' : 'हां, सुरक्षित रूप से हटाएं'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE DISTRICT ADMIN ===================== */}
      {showAddAdminModal && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>+ नया ज़िला व्यवस्थापक खाता बनाएं</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              Super Admin द्वारा ज़िला-स्तरीय प्रशासनिक नियंत्रण प्रदान करें।
            </p>

            <div
              style={{
                padding: '8px 12px',
                background: 'var(--card-sunk)',
                borderRadius: 'var(--r)',
                marginBottom: 14,
                fontSize: 12.5,
                color: 'var(--ink-2)',
                border: '1px solid var(--rule-soft)',
              }}
            >
              🏛️ <strong>ज़िला व्यवस्थापक अधिकार:</strong> व्यवस्थापक केवल अपने निर्दिष्ट ज़िले के थानों और पुलिस अधिकारियों का प्रबंधन कर सकते हैं।
            </div>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleCreateAdmin}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="उदा. अमित त्रिपाठी"
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>यूजरनेम (वैकल्पिक)</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="उदा. sp_lucknow (डिफ़ॉल्ट: ईमेल)"
                    value={adminForm.username}
                    onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, display: 'block' }}>
                    'admin' या 'superadmin' मान्य नहीं है
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर *</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="input"
                    placeholder="10 अंकों का मोबाइल"
                    value={adminForm.mobile}
                    onChange={(e) => setAdminForm({ ...adminForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल आईडी *</span>
                  <input
                    type="email"
                    required
                    className="input"
                    placeholder="admin@uppolice.gov.in"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <span>असाइन किया गया ज़िला *</span>
                <select
                  className="input"
                  required
                  value={adminForm.district}
                  onChange={(e) => setAdminForm({ ...adminForm, district: e.target.value })}
                  disabled={locationLoading}
                >
                  <option value="">{locationLoading ? 'ज़िले लोड हो रहे हैं...' : 'ज़िला चुनें'}</option>
                  {locationData.districts.map((d) => {
                    const isOccupied = !!assignedDistrictsMap[d.trim().toLowerCase()];
                    return (
                      <option key={d} value={d}>
                        {d} {isOccupied ? '⚠️ (पहले से नियुक्त)' : '✓ (रिक्त)'}
                      </option>
                    );
                  })}
                </select>
                {adminForm.district && assignedDistrictsMap[adminForm.district.trim().toLowerCase()] && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--alarm)', fontWeight: 600 }}>
                    ⚠️ ज़िला "{adminForm.district}" में पहले से मुख्य व्यवस्थापक ({assignedDistrictsMap[adminForm.district.trim().toLowerCase()].name}) सक्रिय हैं। प्रत्येक ज़िले में केवल 1 मुख्य व्यवस्थापक हो सकता है।
                  </div>
                )}
                {locationData.districts.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, display: 'block' }}>
                    उपलब्ध कुल ज़िले: {locationData.districts.length} (समस्त उत्तर प्रदेश)
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पासवर्ड *</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type={showAdminPassword ? 'text' : 'password'}
                      required
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="कम से कम 8 अक्षर"
                      value={adminForm.password}
                      onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="btn btn-quiet"
                      style={{ padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      tabIndex={-1}
                    >
                      {showAdminPassword ? 'छिपाएं' : 'दिखाएं'}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <span>पासवर्ड की पुष्टि *</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type={showAdminConfirmPassword ? 'text' : 'password'}
                      required
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="वही पासवर्ड दोबारा भरें"
                      value={adminForm.confirmPassword}
                      onChange={(e) => setAdminForm({ ...adminForm, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="btn btn-quiet"
                      style={{ padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
                      onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                      tabIndex={-1}
                    >
                      {showAdminConfirmPassword ? 'छिपाएं' : 'दिखाएं'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setShowAddAdminModal(false)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy || (adminForm.district && !!assignedDistrictsMap[adminForm.district.trim().toLowerCase()])}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'व्यवस्थापक खाता बनाएं'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: EDIT DISTRICT ADMIN ===================== */}
      {editingAdmin && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>ज़िला व्यवस्थापक संपादित करें</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              {editingAdmin.name} — अधिकार क्षेत्र व संपर्क विवरण अपडेट करें
            </p>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleUpdateAdmin}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>असाइन किया गया ज़िला (Reassign District) *</span>
                  <select
                    className="input"
                    required
                    value={adminForm.district}
                    onChange={(e) => setAdminForm({ ...adminForm, district: e.target.value })}
                    disabled={locationLoading}
                  >
                    <option value="">{locationLoading ? 'ज़िले लोड हो रहे हैं...' : 'ज़िला चुनें'}</option>
                    {locationData.districts.map((d) => {
                      const dNorm = d.trim().toLowerCase();
                      const currentNorm = (editingAdmin.district || '').trim().toLowerCase();
                      const isOccupiedByOther = assignedDistrictsMap[dNorm] && dNorm !== currentNorm;
                      return (
                        <option key={d} value={d}>
                          {d} {isOccupiedByOther ? '⚠️ (पहले से नियुक्त)' : (dNorm === currentNorm ? '✓ (वर्तमान ज़िला)' : '✓ (रिक्त)')}
                        </option>
                      );
                    })}
                  </select>
                  {adminForm.district && adminForm.district.trim().toLowerCase() !== (editingAdmin.district || '').trim().toLowerCase() && assignedDistrictsMap[adminForm.district.trim().toLowerCase()] && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--alarm)', fontWeight: 600 }}>
                      ⚠️ ज़िला "{adminForm.district}" में पहले से मुख्य व्यवस्थापक ({assignedDistrictsMap[adminForm.district.trim().toLowerCase()].name}) सक्रिय हैं।
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर</span>
                  <input
                    type="tel"
                    maxLength={10}
                    className="input"
                    value={adminForm.mobile}
                    onChange={(e) => setAdminForm({ ...adminForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल आईडी</span>
                  <input
                    type="email"
                    className="input"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setEditingAdmin(null)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy || (adminForm.district && adminForm.district.trim().toLowerCase() !== (editingAdmin.district || '').trim().toLowerCase() && !!assignedDistrictsMap[adminForm.district.trim().toLowerCase()])}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अपडेट सहेजें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: OFFICER PERMISSIONS ===================== */}
      {managingPermissionsOfficer && (
        <div style={modalOverlayStyle}>
          <div className="card" style={{ ...modalContentStyle, maxWidth: 520 }}>
            <h2>🔑 पुलिस अधिकारी कार्य-अनुमतियां</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              {managingPermissionsOfficer.name} (PNO: {managingPermissionsOfficer.username || managingPermissionsOfficer.badgeId}) — {managingPermissionsOfficer.station}, {managingPermissionsOfficer.district}
            </p>

            <div
              style={{
                padding: '10px 14px',
                background: 'var(--card-sunk)',
                borderRadius: 'var(--r)',
                marginBottom: 16,
                fontSize: 12.5,
                color: 'var(--ink-2)',
                border: '1px solid var(--rule-soft)',
                lineHeight: 1.5,
              }}
            >
              🛡️ <strong>अनुमति नियंत्रण नीति:</strong>
              <div style={{ marginTop: 4 }}>
                ज़िला व्यवस्थापक केवल अपने ज़िले के अधिकारियों को शिकायत निस्तारण व स्थानांतरण की अनुमतियां प्रदान कर सकते हैं। सुपर व्यवस्थापक या राज्य-स्तरीय अनुमतियां सुरक्षित हैं।
              </div>
            </div>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleSaveOfficerPermissions}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 14px',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--r)',
                    cursor: 'pointer',
                    background: officerPermsState.canReject ? 'rgba(26, 75, 140, 0.04)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={officerPermsState.canReject}
                    onChange={(e) => setOfficerPermsState({ ...officerPermsState, canReject: e.target.checked })}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: 14 }}>शिकायत निरस्तीकरण अधिकार (Can Reject Complaints)</strong>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      अधिकारी को उचित कारण व साक्ष्य के आधार पर अमान्य शिकायत निरस्त करने की अनुमति।
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 14px',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--r)',
                    cursor: 'pointer',
                    background: officerPermsState.canTransfer ? 'rgba(26, 75, 140, 0.04)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={officerPermsState.canTransfer}
                    onChange={(e) => setOfficerPermsState({ ...officerPermsState, canTransfer: e.target.checked })}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: 14 }}>थाना स्थानांतरण अधिकार (Can Transfer Complaints)</strong>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      शिकायत को अधिकार क्षेत्र के अनुसार अन्य संबंधित थाने में स्थानांतरित करने की अनुमति।
                    </span>
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setManagingPermissionsOfficer(null)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अनुमतियां सुरक्षित करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-3)',
  marginBottom: 4,
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 42, 68, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const modalContentStyle = {
  width: '100%',
  maxWidth: 580,
  padding: 24,
  maxHeight: '90vh',
  overflowY: 'auto',
};
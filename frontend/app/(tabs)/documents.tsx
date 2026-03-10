import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../src/store/authStore';
import {
  getFolders,
  getFolder,
  createFolder,
  deleteFolder,
  renameFolder,
  getFiles,
  uploadFile,
  deleteFile,
  renameFile,
  searchDocuments,
  getBreadcrumb,
} from '../../src/services/api';
import Card from '../../src/components/Card';
import LoadingSpinner from '../../src/components/LoadingSpinner';

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  description: string | null;
  created_by: string;
  created_at: string;
  children_count: number;
  files_count: number;
}

interface Document {
  id: string;
  filename: string;
  original_filename: string;
  folder_id: string;
  folder_path: string;
  file_size: number;
  file_type: string;
  mime_type: string;
  description: string | null;
  uploaded_by: string;
  uploaded_by_role: string;
  uploaded_at: string;
  version: number;
  previous_versions: any[];
}

interface Breadcrumb {
  id: string;
  name: string;
}

const FILE_ICONS: Record<string, string> = {
  '.pdf': 'document-text',
  '.doc': 'document',
  '.docx': 'document',
  '.xls': 'grid',
  '.xlsx': 'grid',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.csv': 'grid',
  '.txt': 'document-text',
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function DocumentsScreen() {
  const { user, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Document[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ folders: Folder[]; documents: Document[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Modals
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFileDetailModal, setShowFileDetailModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<Document | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; id: string; currentName: string } | null>(null);
  const [newName, setNewName] = useState('');
  
  // Form state
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [foldersRes, filesRes] = await Promise.all([
        getFolders(currentFolderId || undefined),
        getFiles(currentFolderId || undefined),
      ]);
      setFolders(foldersRes.data);
      setFiles(filesRes.data);
      
      if (currentFolderId) {
        const breadcrumbRes = await getBreadcrumb(currentFolderId);
        setBreadcrumb(breadcrumbRes.data);
      } else {
        setBreadcrumb([]);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    setSearchResults(null);
    setSearchQuery('');
    fetchData();
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    
    setIsSearching(true);
    try {
      const response = await searchDocuments(searchQuery);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearchResults(null);
    setSearchQuery('');
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    try {
      await createFolder({
        name: newFolderName.trim(),
        parent_id: currentFolderId || undefined,
        description: newFolderDescription.trim() || undefined,
      });
      setShowCreateFolderModal(false);
      setNewFolderName('');
      setNewFolderDescription('');
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (folder.children_count > 0 || folder.files_count > 0) {
      Alert.alert('Error', 'Cannot delete folder with contents. Remove all files and subfolders first.');
      return;
    }

    if (Platform.OS === 'web') {
      if (confirm(`Delete folder "${folder.name}"?`)) {
        try {
          await deleteFolder(folder.id);
          fetchData();
        } catch (error: any) {
          alert(error.response?.data?.detail || 'Failed to delete folder');
        }
      }
    } else {
      Alert.alert(
        'Delete Folder',
        `Are you sure you want to delete "${folder.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteFolder(folder.id);
                fetchData();
              } catch (error: any) {
                Alert.alert('Error', error.response?.data?.detail || 'Failed to delete folder');
              }
            },
          },
        ]
      );
    }
  };

  const handlePickFile = async () => {
    // Ensure we're inside a folder
    if (!currentFolderId) {
      if (Platform.OS === 'web') {
        alert('Please navigate into a folder before uploading files.');
      } else {
        Alert.alert('Error', 'Please navigate into a folder before uploading files.');
      }
      return;
    }
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'text/csv', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      
      // Check file size (25MB max)
      if (file.size && file.size > 25 * 1024 * 1024) {
        if (Platform.OS === 'web') {
          alert('File too large. Maximum size is 25MB.');
        } else {
          Alert.alert('Error', 'File too large. Maximum size is 25MB.');
        }
        return;
      }

      setUploading(true);
      
      const formData = new FormData();
      
      // Handle web vs native file differently
      if (Platform.OS === 'web') {
        // On web, we need to fetch the file and create a Blob
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append('file', blob, file.name);
      } else {
        // On native, use the URI approach
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        } as any);
      }
      
      formData.append('folder_id', currentFolderId);
      if (uploadDescription) {
        formData.append('description', uploadDescription);
      }

      await uploadFile(formData);
      
      setShowUploadModal(false);
      setUploadDescription('');
      fetchData();
      
      if (Platform.OS === 'web') {
        alert('File uploaded successfully');
      } else {
        Alert.alert('Success', 'File uploaded successfully');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to upload file';
      if (Platform.OS === 'web') {
        alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (file: Document) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${file.original_filename}"?`)) {
        try {
          await deleteFile(file.id);
          setShowFileDetailModal(false);
          fetchData();
        } catch (error: any) {
          alert(error.response?.data?.detail || 'Failed to delete file');
        }
      }
    } else {
      Alert.alert(
        'Delete File',
        `Are you sure you want to delete "${file.original_filename}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteFile(file.id);
                setShowFileDetailModal(false);
                fetchData();
              } catch (error: any) {
                Alert.alert('Error', error.response?.data?.detail || 'Failed to delete file');
              }
            },
          },
        ]
      );
    }
  };

  // Rename handlers
  const openRenameModal = (type: 'file' | 'folder', id: string, currentName: string) => {
    setRenameTarget({ type, id, currentName });
    setNewName(currentName);
    setShowRenameModal(true);
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    
    try {
      if (renameTarget.type === 'file') {
        await renameFile(renameTarget.id, newName.trim());
      } else {
        await renameFolder(renameTarget.id, newName.trim());
      }
      setShowRenameModal(false);
      setRenameTarget(null);
      setNewName('');
      if (Platform.OS === 'web') {
        alert(`${renameTarget.type === 'file' ? 'File' : 'Folder'} renamed successfully`);
      } else {
        Alert.alert('Success', `${renameTarget.type === 'file' ? 'File' : 'Folder'} renamed successfully`);
      }
      fetchData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to rename';
      if (Platform.OS === 'web') {
        alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    }
  };

  const handleDownloadFile = async (file: Document) => {
    try {
      if (Platform.OS === 'web') {
        // For web: fetch with auth token and trigger download
        const { downloadFile } = await import('../../src/services/api');
        const response = await downloadFile(file.id);
        
        // Create blob URL and trigger download
        const blob = new Blob([response.data], { type: file.mime_type });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.original_filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        // For native (iOS/Android): use FileSystem.downloadAsync with auth headers
        const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const downloadUrl = `${API_URL}/api/documents/files/${file.id}/download`;
        
        // Get auth token
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          Alert.alert('Error', 'Please login again to download files');
          return;
        }
        
        // Create a safe filename (remove special characters)
        const safeFilename = file.original_filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileUri = FileSystem.cacheDirectory + safeFilename;
        
        // Show downloading indicator
        Alert.alert('Downloading', `Downloading ${file.original_filename}...`);
        
        try {
          // Use FileSystem.downloadAsync for more reliable downloads
          const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (downloadResult.status !== 200) {
            console.error('Download failed with status:', downloadResult.status);
            Alert.alert('Error', `Download failed: Server returned ${downloadResult.status}`);
            return;
          }
          
          // Verify file was downloaded
          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
          if (!fileInfo.exists) {
            Alert.alert('Error', 'Download failed - file not saved');
            return;
          }
          
          // Check if sharing is available
          const isSharingAvailable = await Sharing.isAvailableAsync();
          if (isSharingAvailable) {
            // Open share dialog to save/open the file
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: file.mime_type,
              dialogTitle: `Open ${file.original_filename}`,
            });
          } else {
            Alert.alert('Success', `File downloaded successfully!\nLocation: ${downloadResult.uri}`);
          }
          
        } catch (downloadError: any) {
          console.error('Download error details:', downloadError);
          
          // Fallback: Try fetch-based approach if downloadAsync fails
          try {
            console.log('Trying fallback fetch approach...');
            const response = await fetch(downloadUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            
            if (!response.ok) {
              Alert.alert('Error', `Download failed: ${response.status}`);
              return;
            }
            
            const blob = await response.blob();
            
            // Read blob as array buffer and write
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < uint8Array.length; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64Content = btoa(binary);
            
            await FileSystem.writeAsStringAsync(fileUri, base64Content, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            const isSharingAvailable = await Sharing.isAvailableAsync();
            if (isSharingAvailable) {
              await Sharing.shareAsync(fileUri, {
                mimeType: file.mime_type,
                dialogTitle: `Open ${file.original_filename}`,
              });
            } else {
              Alert.alert('Success', `File saved to: ${fileUri}`);
            }
          } catch (fallbackError: any) {
            console.error('Fallback download also failed:', fallbackError);
            Alert.alert('Error', `Download failed: ${fallbackError.message || 'Unknown error'}`);
          }
        }
      }
    } catch (error: any) {
      console.error('Download error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Could not download file';
      if (Platform.OS === 'web') {
        alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    }
  };

  const openFileDetail = (file: Document) => {
    setSelectedFile(file);
    setShowFileDetailModal(true);
  };

  if (loading && folders.length === 0 && files.length === 0 && !refreshing) {
    return <LoadingSpinner message="Loading documents..." />;
  }

  const renderContent = () => {
    // Search Results
    if (searchResults) {
      return (
        <View>
          <View style={styles.searchResultsHeader}>
            <Text style={styles.searchResultsTitle}>
              Search Results for "{searchQuery}"
            </Text>
            <TouchableOpacity onPress={clearSearch}>
              <Text style={styles.clearSearchText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {searchResults.folders.length > 0 && (
            <>
              <Text style={styles.resultSectionTitle}>Folders ({searchResults.folders.length})</Text>
              {searchResults.folders.map(folder => (
                <TouchableOpacity
                  key={folder.id}
                  onPress={() => navigateToFolder(folder.id)}
                >
                  <Card style={styles.folderCard}>
                    <View style={styles.folderIcon}>
                      <Ionicons name="folder" size={24} color="#f59e0b" />
                    </View>
                    <View style={styles.folderInfo}>
                      <Text style={styles.folderName}>{folder.name}</Text>
                      <Text style={styles.folderPath}>{folder.path}</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          )}

          {searchResults.documents.length > 0 && (
            <>
              <Text style={styles.resultSectionTitle}>Files ({searchResults.documents.length})</Text>
              {searchResults.documents.map(file => (
                <TouchableOpacity
                  key={file.id}
                  onPress={() => openFileDetail(file)}
                >
                  <Card style={styles.fileCard}>
                    <View style={[styles.fileIcon, { backgroundColor: '#eff6ff' }]}>
                      <Ionicons
                        name={(FILE_ICONS[file.file_type] || 'document') as any}
                        size={20}
                        color="#2563eb"
                      />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>{file.original_filename}</Text>
                      <Text style={styles.fileMeta}>{file.folder_path}</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          )}

          {searchResults.folders.length === 0 && searchResults.documents.length === 0 && (
            <Card style={styles.emptyCard}>
              <Ionicons name="search" size={48} color="#94a3b8" />
              <Text style={styles.emptyText}>No results found</Text>
            </Card>
          )}
        </View>
      );
    }

    // Normal folder/file view
    return (
      <View>
        {/* Folders */}
        {folders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Folders</Text>
            {folders.map(folder => (
              <TouchableOpacity
                key={folder.id}
                onPress={() => navigateToFolder(folder.id)}
                onLongPress={() => isAdmin && handleDeleteFolder(folder)}
              >
                <Card style={styles.folderCard}>
                  <View style={styles.folderIcon}>
                    <Ionicons name="folder" size={24} color="#f59e0b" />
                  </View>
                  <View style={styles.folderInfo}>
                    <Text style={styles.folderName}>{folder.name}</Text>
                    <Text style={styles.folderMeta}>
                      {folder.children_count > 0 && `${folder.children_count} folders`}
                      {folder.children_count > 0 && folder.files_count > 0 && ' • '}
                      {folder.files_count > 0 && `${folder.files_count} files`}
                      {folder.children_count === 0 && folder.files_count === 0 && 'Empty'}
                    </Text>
                  </View>
                  {isAdmin && (
                    <Pressable 
                      style={styles.renameButton}
                      onPress={() => openRenameModal('folder', folder.id, folder.name)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="pencil" size={18} color="#2563eb" />
                    </Pressable>
                  )}
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Files */}
        {files.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Files</Text>
            {files.map(file => (
              <TouchableOpacity
                key={file.id}
                onPress={() => openFileDetail(file)}
              >
                <Card style={styles.fileCard}>
                  <View style={[styles.fileIcon, { backgroundColor: '#eff6ff' }]}>
                    <Ionicons
                      name={(FILE_ICONS[file.file_type] || 'document') as any}
                      size={20}
                      color="#2563eb"
                    />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{file.original_filename}</Text>
                    <Text style={styles.fileMeta}>
                      {formatFileSize(file.file_size)} • {formatDate(file.uploaded_at)}
                      {file.version > 1 && ` • v${file.version}`}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty State */}
        {folders.length === 0 && files.length === 0 && (
          <Card style={styles.emptyCard}>
            <Ionicons name="folder-open" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>This folder is empty</Text>
            {isAdmin && (
              <Text style={styles.emptySubtext}>
                Upload files or create subfolders
              </Text>
            )}
          </Card>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        {isAdmin && currentFolderId && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowCreateFolderModal(true)}
            >
              <Ionicons name="folder-open" size={20} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerButton, styles.uploadButton]}
              onPress={() => setShowUploadModal(true)}
            >
              <Ionicons name="cloud-upload" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search documents..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={20} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
        {isSearching && <ActivityIndicator size="small" color="#2563eb" />}
      </View>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && !searchResults && (
        <View style={styles.breadcrumbContainer}>
          <TouchableOpacity
            style={styles.breadcrumbItem}
            onPress={() => navigateToFolder(null)}
          >
            <Ionicons name="home" size={16} color="#2563eb" />
          </TouchableOpacity>
          {breadcrumb.map((item, index) => (
            <View key={item.id} style={styles.breadcrumbItem}>
              <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
              <TouchableOpacity
                onPress={() => navigateToFolder(item.id)}
              >
                <Text style={[
                  styles.breadcrumbText,
                  index === breadcrumb.length - 1 && styles.breadcrumbTextActive
                ]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderContent()}
      </ScrollView>

      {/* Create Folder Modal */}
      <Modal
        visible={showCreateFolderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Folder</Text>
              <TouchableOpacity onPress={() => setShowCreateFolderModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Folder Name</Text>
              <TextInput
                style={styles.input}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Enter folder name"
              />
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newFolderDescription}
                onChangeText={setNewFolderDescription}
                placeholder="Enter description"
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowCreateFolderModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submitButton} onPress={handleCreateFolder}>
                <Text style={styles.submitButtonText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload File</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={uploadDescription}
                onChangeText={setUploadDescription}
                placeholder="Enter file description"
                multiline
                numberOfLines={3}
              />
              <Text style={styles.uploadNote}>
                Allowed: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, CSV, TXT{'\n'}
                Maximum size: 25MB
              </Text>
            </View>
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowUploadModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
                onPress={handlePickFile}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Select File</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* File Detail Modal */}
      <Modal
        visible={showFileDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFileDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>File Details</Text>
              <TouchableOpacity onPress={() => setShowFileDetailModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            {selectedFile && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.fileDetailHeader}>
                  <View style={[styles.fileDetailIcon, { backgroundColor: '#eff6ff' }]}>
                    <Ionicons
                      name={(FILE_ICONS[selectedFile.file_type] || 'document') as any}
                      size={32}
                      color="#2563eb"
                    />
                  </View>
                  <Text style={styles.fileDetailName}>{selectedFile.original_filename}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Size</Text>
                  <Text style={styles.detailValue}>{formatFileSize(selectedFile.file_size)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>{selectedFile.file_type.toUpperCase()}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location</Text>
                  <Text style={styles.detailValue}>{selectedFile.folder_path}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Uploaded By</Text>
                  <Text style={styles.detailValue}>
                    {selectedFile.uploaded_by} ({selectedFile.uploaded_by_role})
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Upload Date</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedFile.uploaded_at)}</Text>
                </View>
                {selectedFile.version > 1 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Version</Text>
                    <Text style={styles.detailValue}>v{selectedFile.version}</Text>
                  </View>
                )}
                {selectedFile.description && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{selectedFile.description}</Text>
                  </View>
                )}
              </ScrollView>
            )}
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.downloadButton}
                onPress={() => selectedFile && handleDownloadFile(selectedFile)}
              >
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>Download</Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  style={styles.renameModalButton}
                  onPress={() => {
                    if (selectedFile) {
                      setShowFileDetailModal(false);
                      openRenameModal('file', selectedFile.id, selectedFile.original_filename);
                    }
                  }}
                >
                  <Ionicons name="pencil" size={18} color="#fff" />
                </Pressable>
              )}
              {isAdmin && (
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => selectedFile && handleDeleteFile(selectedFile)}
                >
                  <Ionicons name="trash" size={18} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename {renameTarget?.type === 'file' ? 'File' : 'Folder'}</Text>
              <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>New Name</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter new name"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleRename}
              >
                <Text style={styles.confirmButtonText}>Rename</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  uploadButton: {
    backgroundColor: '#2563eb',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingTop: 8,
    backgroundColor: '#fff',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1e293b',
  },
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: 12,
    paddingTop: 0,
    backgroundColor: '#fff',
    gap: 4,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumbText: {
    fontSize: 14,
    color: '#2563eb',
  },
  breadcrumbTextActive: {
    color: '#1e293b',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  folderMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  folderPath: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  fileMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  searchResultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchResultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  clearSearchText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  resultSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  uploadNote: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 16,
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#2563eb',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fileDetailHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 16,
  },
  fileDetailIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fileDetailName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    maxWidth: '60%',
    textAlign: 'right',
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
  },
  renameButton: {
    padding: 12,
    marginRight: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  renameModalButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    marginHorizontal: 8,
  },
});

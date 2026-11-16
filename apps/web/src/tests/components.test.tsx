import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MobileNavigation } from '@/components/layout/MobileNavigation';
import { Dropdown } from '@/components/ui/DropdownAndPopover';
import { Select } from '@/components/ui/FormControls';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { FileList } from '@/features/files/components/FileList';
import { FilePreviewModal } from '@/features/files/components/FilePreviewModal';
import { LandingPage } from '@/features/landing/LandingPage';
import { RoomExpiredPage, RoomNotFoundPage } from '@/features/room/components/RoomStatusPages';
import { useUIStore } from '@/stores/ui.store';

describe('DropRoom UI components', () => {
  it('renders LandingPage matching reference layout with Create and Join Room tabs', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('DropRoom')).toBeInTheDocument();
    expect(screen.getByText(/Buat atau Masuk ke/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Acak/i })).toBeInTheDocument();
    expect(screen.getByText('Cepat & Ringan')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Buat Room/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Masuk Room/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Masuk Room/i }));
    expect(screen.getByRole('button', { name: /Masuk Room/i })).toBeInTheDocument();
  });

  it('toggles Light and Dark mode cleanly', () => {
    useUIStore.getState().setTheme('light');
    render(<ThemeToggle />);

    const btn = screen.getByRole('button', { name: /Mode Gelap/i });
    fireEvent.click(btn);
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('renders iOS floating pill mobile navigation and switches tabs', () => {
    useUIStore.getState().setActiveTab('files');
    render(<MobileNavigation />);

    const pasteBtn = screen.getByRole('button', { name: /Paste/i });
    fireEvent.click(pasteBtn);
    expect(useUIStore.getState().activeTab).toBe('pastes');
  });

  it('renders RoomExpiredPage and RoomNotFoundPage cleanly', () => {
    render(
      <MemoryRouter>
        <RoomExpiredPage code="QWE" />
      </MemoryRouter>
    );
    expect(screen.getByText(/Room QWE Telah Kedaluwarsa/i)).toBeInTheDocument();

    render(
      <MemoryRouter>
        <RoomNotFoundPage code="XYZ" />
      </MemoryRouter>
    );
    expect(screen.getByText(/Room XYZ Tidak Ditemukan/i)).toBeInTheDocument();
  });

  it('opens custom glass Select dropdown and selects an option', () => {
    const onChange = vi.fn();
    render(
      <Select
        aria-label="Satuan Durasi"
        value="days"
        onChange={onChange}
        options={[
          { value: 'minutes', label: 'Menit' },
          { value: 'hours', label: 'Jam' },
          { value: 'days', label: 'Hari' },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /Satuan Durasi/i });
    fireEvent.click(trigger);

    const jamOption = screen.getByRole('option', { name: 'Jam' });
    fireEvent.click(jamOption);
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'hours' } });
  });

  it('sorts files and supports checkbox bulk delete selection in FileList', () => {
    const onBulkDelete = vi.fn();
    const sampleFiles = [
      {
        id: 'f1',
        room_id: 'r1',
        original_name: 'beta.txt',
        mime_type: 'text/plain',
        file_size: 100,
        download_count: 0,
        created_at: '2026-11-16T10:00:00Z',
      },
      {
        id: 'f2',
        room_id: 'r1',
        original_name: 'alpha.txt',
        mime_type: 'text/plain',
        file_size: 500,
        download_count: 1,
        created_at: '2026-11-16T11:00:00Z',
      },
    ];

    render(
      <FileList
        files={sampleFiles}
        loading={false}
        onPreview={vi.fn()}
        onEditContent={vi.fn()}
        onRename={vi.fn()}
        onCopyLink={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onBulkDelete={onBulkDelete}
      />
    );

    // Sort A-Z
    fireEvent.click(screen.getByRole('button', { name: /Urutkan File/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Nama A–Z' }));
    const names = screen.getAllByText(/\.txt$/).map((el) => el.textContent);
    expect(names).toEqual(['alpha.txt', 'beta.txt']);

    // Select all & bulk delete
    fireEvent.click(screen.getByRole('checkbox', { name: /Pilih semua file/i }));
    const bulkBtn = screen.getByRole('button', { name: /Hapus Terpilih \(2\)/i });
    fireEvent.click(bulkBtn);
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
    expect(onBulkDelete.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('renders FilePreviewModal centered via document.body portal with iOS backdrop blur', () => {
    const { container } = render(
      <div data-testid="nested-ancestor">
        <FilePreviewModal
          file={{
            id: 'f-img',
            room_id: 'r1',
            original_name: 'screenshot.png',
            mime_type: 'image/png',
            file_size: 2048,
            download_count: 0,
            created_at: '2026-11-16T10:00:00Z',
          }}
          roomCode="ABC"
          onClose={vi.fn()}
          onDownload={vi.fn()}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.className).toContain('items-center');
    expect(dialog.className).toContain('justify-center');
    expect(dialog.querySelector('.ios-modal-backdrop')).not.toBeNull();
    expect(screen.getByText('screenshot.png')).toBeInTheDocument();
  });

  it('portals Dropdown menu outside overflow containers to document.body', () => {
    const onRename = vi.fn();
    const { container } = render(
      <div className="max-h-40 overflow-y-auto" data-testid="scroll-card">
        <Dropdown
          trigger={<button type="button">Opsi Lainnya</button>}
          items={[
            { id: 'rename', label: 'Ubah Nama File', onClick: onRename },
            { id: 'delete', label: 'Hapus File', danger: true, onClick: vi.fn() },
          ]}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Opsi Lainnya' }));
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
    expect(menu.style.position).toBe('fixed');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ubah Nama File' }));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('exposes Word editor action button for .docx files in FileList', () => {
    const onEditWord = vi.fn();
    render(
      <FileList
        files={[
          {
            id: 'docx-1',
            room_id: 'r1',
            original_name: 'Kontrak.docx',
            mime_type:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            file_size: 4096,
            download_count: 0,
            created_at: '2026-11-16T10:00:00Z',
          },
        ]}
        loading={false}
        onPreview={vi.fn()}
        onEditContent={vi.fn()}
        onEditWord={onEditWord}
        onRename={vi.fn()}
        onCopyLink={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        onBulkDelete={vi.fn()}
      />
    );

    const wordBtn = screen.getByRole('button', { name: 'Edit Dokumen Word' });
    fireEvent.click(wordBtn);
    expect(onEditWord).toHaveBeenCalledTimes(1);
    expect(onEditWord.mock.calls[0]?.[0]?.id).toBe('docx-1');
  });
});

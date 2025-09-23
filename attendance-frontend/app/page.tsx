"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "../components/ui/input";
import { ToastContainer, useToast } from "../components/ui/toast";

interface AttendanceRecord {
  id: number;
  userId: string;
  datetime: string;
  status: string;
  verifyType: string;
  isSynced: boolean;
  createdAt: string;
  lastError?: string;
}

interface ApiResponse {
  data: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function Home() {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [filter, setFilter] = useState("all");
  const [totalPages, setTotalPages] = useState(0);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({ total: 0, synced: 0, unsynced: 0 });
  const { toasts, addToast, removeToast } = useToast();

  const filteredData = data.filter(
    (record) =>
      searchTerm === "" ||
      record.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.verifyType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get<ApiResponse>(
        `http://localhost:4001/attendance?page=${page}&limit=${limit}&filter=${filter}`
      );
      setData(response.data.data);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get("http://localhost:4001/stats");
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [page, filter]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const newSocket = io("http://localhost:4001");
    setSocket(newSocket);

    newSocket.on("syncUpdate", (update: { id: number; isSynced: boolean }) => {
      setData((prev) =>
        prev.map((record) =>
          record.id === update.id
            ? { ...record, isSynced: update.isSynced }
            : record
        )
      );
      fetchStats();
    });

    newSocket.on("newRecord", (newRecord: AttendanceRecord) => {
      if (page === 1) {
        if (
          filter === "all" ||
          (filter === "synced" && newRecord.isSynced) ||
          (filter === "unsynced" && !newRecord.isSynced)
        ) {
          setData((prev) => [newRecord, ...prev.slice(0, limit - 1)]);
        }
      }
      fetchStats();
    });

    newSocket.on("statsUpdate", () => {
      fetchStats();
    });

    return () => {
      newSocket.close();
    };
  }, [page, filter, limit]);

  const syncAll = async () => {
    try {
      const response = await axios.get("http://localhost:4001/unsynced-ids");
      const { ids, count } = response.data;

      if (ids.length === 0) {
        addToast("No unsynced records found", "info");
        return;
      }

      await axios.post("http://localhost:4001/sync", { ids });
      addToast(
        `Sync initiated for all ${count} unsynced records across all pages`,
        "success"
      );
    } catch (error) {
      console.error("Error syncing:", error);
      addToast("Error initiating sync. Please try again.", "error");
    }
  };

  const syncSelected = async () => {
    if (selectedRows.length === 0) return;

    const selectedRecords = data.filter((record) =>
      selectedRows.includes(record.id)
    );
    const alreadySyncedRecords = selectedRecords.filter(
      (record) => record.isSynced
    );
    const unsyncedRecords = selectedRecords.filter(
      (record) => !record.isSynced
    );

    if (unsyncedRecords.length === 0) {
      addToast(
        "All selected records are already synced. Nothing to sync.",
        "info"
      );
      return;
    }

    try {
      const unsyncedIds = unsyncedRecords.map((record) => record.id);
      await axios.post("http://localhost:4001/sync", { ids: unsyncedIds });
      addToast(
        `Sync initiated for ${unsyncedRecords.length} unsynced records`,
        "success"
      );
      setSelectedRows([]);
    } catch (error) {
      console.error("Error syncing:", error);
      addToast("Error initiating sync. Please try again.", "error");
    }
  };

  const columns: ColumnDef<AttendanceRecord>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
    {
      accessorKey: "id",
      header: "ID",
      size: 80,
    },
    {
      accessorKey: "userId",
      header: "User ID",
      size: 100,
    },
    {
      accessorKey: "datetime",
      header: "DateTime",
      size: 180,
      cell: ({ getValue }) => (
        <span className="text-sm">
          {new Date(getValue() as string).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 100,
      cell: ({ getValue }) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "verifyType",
      header: "Verify Type",
      size: 120,
      cell: ({ getValue }) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "isSynced",
      header: "Synced",
      size: 120,
      cell: ({ getValue }) => (
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
            getValue()
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full mr-1 ${
              getValue() ? "bg-green-500" : "bg-orange-500"
            }`}
          ></span>
          {getValue() ? "Synced" : "Pending"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      size: 160,
      cell: ({ getValue }) => (
        <span className="text-sm">
          {new Date(getValue() as string).toLocaleString()}
        </span>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    enableRowSelection: true,
    state: {
      pagination: {
        pageIndex: page - 1,
        pageSize: limit,
      },
      rowSelection: selectedRows.reduce((acc, id) => {
        const rowIndex = filteredData.findIndex((record) => record.id === id);
        if (rowIndex !== -1) {
          acc[rowIndex] = true;
        }
        return acc;
      }, {} as Record<string, boolean>),
    },
    onPaginationChange: (updater) => {
      if (typeof updater === "function") {
        const newState = updater({ pageIndex: page - 1, pageSize: limit });
        setPage(newState.pageIndex + 1);
      }
    },
    onRowSelectionChange: (updater) => {
      const currentSelection = selectedRows.reduce((acc, id) => {
        const rowIndex = filteredData.findIndex((record) => record.id === id);
        if (rowIndex !== -1) {
          acc[rowIndex] = true;
        }
        return acc;
      }, {} as Record<string, boolean>);

      const newSelection =
        typeof updater === "function" ? updater(currentSelection) : updater;

      const newSelectedRows: number[] = [];
      Object.entries(newSelection).forEach(([rowIndex, isSelected]) => {
        if (isSelected && filteredData[parseInt(rowIndex)]) {
          newSelectedRows.push(filteredData[parseInt(rowIndex)].id);
        }
      });

      setSelectedRows(newSelectedRows);
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-pink-400/20 to-orange-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-6 shadow-2xl">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            Attendance Management
          </h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Total Records
                </p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {stats.total}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Synced
                </p>
                <p className="text-3xl font-bold text-green-600">
                  {stats.synced}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Pending
                </p>
                <p className="text-3xl font-bold text-orange-600">
                  {stats.unsynced}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-orange-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Selected
                </p>
                <p className="text-3xl font-bold text-purple-600">
                  {selectedRows.length}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-purple-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl p-8 shadow-xl border border-white/20 mb-8">
          <div className="flex flex-wrap gap-6 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Live Sync Active
                </span>
              </div>
              <div className="h-6 w-px bg-slate-300 dark:bg-slate-600"></div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg
                    className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <Input
                    placeholder="Search records..."
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSearchTerm(e.target.value)
                    }
                    className="pl-10 w-[250px] bg-white/50 border-slate-200 dark:border-slate-600"
                  />
                </div>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-[200px] bg-white/50 border-slate-200 dark:border-slate-600">
                    <SelectValue placeholder="Filter Records" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📊 All Records</SelectItem>
                    <SelectItem value="synced">✅ Synced Only</SelectItem>
                    <SelectItem value="unsynced">⏳ Unsynced Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={syncAll}
                disabled={filteredData.filter((r) => !r.isSynced).length === 0}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Sync All Unsynced
              </Button>

              <Button
                onClick={syncSelected}
                disabled={selectedRows.length === 0}
                variant="outline"
                className="border-2 border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Sync Selected ({selectedRows.length})
              </Button>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="w-full">
            <Table className="w-full table-fixed min-w-full">
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 border-b-2 border-slate-200 dark:border-slate-600">
                  {table.getHeaderGroups().map((headerGroup) =>
                    headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="text-slate-700 dark:text-slate-300 font-semibold py-6 px-6"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index} className="animate-pulse">
                      <TableCell className="py-6 px-6">
                        <div className="w-4 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-8 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-12 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-20 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-16 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-14 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-10 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                      <TableCell className="py-6 px-6">
                        <div className="w-24 h-4 bg-slate-300 dark:bg-slate-600 rounded animate-pulse"></div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row, index) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
                        row.getIsSelected()
                          ? "bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-blue-500"
                          : "border-l-4 border-l-transparent"
                      } ${
                        index % 2 === 0
                          ? "bg-white/30 dark:bg-slate-800/30"
                          : "bg-slate-50/30 dark:bg-slate-700/30"
                      }`}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="py-4 px-6 text-slate-700 dark:text-slate-300"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-32 text-center"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <svg
                          className="w-12 h-12 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="text-slate-500 dark:text-slate-400">
                          No attendance records found
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Section */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600 px-8 py-6 border-t border-slate-200 dark:border-slate-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-500">
                  {table.getFilteredSelectedRowModel().rows.length} of{" "}
                  {table.getFilteredRowModel().rows.length} selected
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum =
                      Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 ${
                          pageNum === page
                            ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                            : "border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                        } transition-all duration-200`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
                >
                  Next
                  <svg
                    className="w-4 h-4 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

import { cloneDeep, head } from "lodash-es";
import { ChangeEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import TextareaAutosize from "react-textarea-autosize";
import { useConnectionStore } from "@/store";
import { Connection, Engine, ResponseObject } from "@/types";
import Icon from "./Icon";
import DataStorageBanner from "./DataStorageBanner";
import ActionConfirmModal from "./ActionConfirmModal";

interface Props {
  show: boolean;
  connection?: Connection;
  close: () => void;
}

type SSLType = "none" | "ca-only" | "full";

type SSLFieldType = "ca" | "cert" | "key";

const SSLTypeOptions = [
  {
    label: "None",
    value: "none",
  },
  {
    label: "CA Only",
    value: "ca-only",
  },
  {
    label: "Full",
    value: "full",
  },
];

const defaultConnection: Connection = {
  id: "",
  title: "",
  engineType: Engine.MySQL,
  host: "",
  port: "",
  username: "",
  password: "",
};

const CreateConnectionModal = (props: Props) => {
  const { show, connection: editConnection, close } = props;
  const connectionStore = useConnectionStore();
  const [connection, setConnection] = useState<Connection>(defaultConnection);
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false);
  const [sslType, setSSLType] = useState<SSLType>("none");
  const [selectedSSLField, setSelectedSSLField] = useState<SSLFieldType>("ca");
  const [isRequesting, setIsRequesting] = useState(false);
  const showDatabaseField = connection.engineType === Engine.PostgreSQL;
  const isEditing = editConnection !== undefined;
  const allowSave = connection.host !== "" && connection.username !== "";

  useEffect(() => {
    if (show) {
      const connection = isEditing ? editConnection : defaultConnection;
      setConnection(connection);
      if (connection.ssl) {
        if (connection.ssl.ca && connection.ssl.cert && connection.ssl.key) {
          setSSLType("full");
        } else {
          setSSLType("ca-only");
        }
      } else {
        setSSLType("none");
      }
      setSelectedSSLField("ca");
      setIsRequesting(false);
      setShowDeleteConnectionModal(false);
    }
  }, [show]);

  useEffect(() => {
    let ssl = undefined;
    if (sslType === "ca-only") {
      ssl = {
        ca: "",
      };
    } else if (sslType === "full") {
      ssl = {
        ca: "",
        cert: "",
        key: "",
      };
    }
    setConnection({
      ...connection,
      ssl,
    });
    setSelectedSSLField("ca");
  }, [sslType]);

  const setPartialConnection = (state: Partial<Connection>) => {
    setConnection({
      ...connection,
      ...state,
    });
  };

  const handleSSLFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    if (file.type.startsWith("audio/") || file.type.startsWith("video/") || file.type.startsWith("image/")) {
      toast.error(`Invalid file type:${file.type}`);
      return;
    }

    const fr = new FileReader();
    fr.addEventListener("load", () => {
      setPartialConnection({
        ssl: {
          ...connection.ssl,
          [selectedSSLField]: fr.result as string,
        },
      });
    });
    fr.addEventListener("error", () => {
      toast.error("Failed to read file");
    });
    fr.readAsText(file);
  };

  const handleSSLValueChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setPartialConnection({
      ssl: {
        ...connection.ssl,
        [selectedSSLField]: event.target.value,
      },
    });
  };

  const handleCreateConnection = async () => {
    if (isRequesting) {
      return;
    }

    setIsRequesting(true);
    const tempConnection = cloneDeep(connection);
    if (!showDatabaseField) {
      tempConnection.database = undefined;
    }

    try {
      const response = await fetch("/api/connection/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connection: tempConnection,
        }),
      });
      const result = (await response.json()) as ResponseObject<boolean>;
      if (result.message) {
        toast.error(result.message);
        return;
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to test connection");
    } finally {
      setIsRequesting(false);
    }

    try {
      let connection: Connection;
      if (isEditing) {
        connectionStore.updateConnection(tempConnection.id, tempConnection);
        connection = tempConnection;
      } else {
        connection = connectionStore.createConnection(tempConnection);
      }

      // Set the created connection as the current connection.
      const databaseList = await connectionStore.getOrFetchDatabaseList(connection, true);
      connectionStore.setCurrentConnectionCtx({
        connection: connection,
        database: head(databaseList),
      });
    } catch (error) {
      console.error(error);
      setIsRequesting(false);
      toast.error("Failed to create connection");
      return;
    }

    setIsRequesting(false);
    close();
  };

  const handleDeleteConnection = () => {
    connectionStore.clearConnection((item) => item.id !== connection.id);
    if (connectionStore.currentConnectionCtx?.connection.id === connection.id) {
      connectionStore.setCurrentConnectionCtx(undefined);
    }
    close();
  };

  return (
    <>
      <div className={`modal modal-middle ${show && "modal-open"}`}>
        <div className="modal-box relative">
          <h3 className="font-bold text-lg">{isEditing ? "Edit Connection" : "Create Connection"}</h3>
          <button className="btn btn-sm btn-circle absolute right-4 top-4" onClick={close}>
            <Icon.IoMdClose className="w-5 h-auto" />
          </button>
          <div className="w-full flex flex-col justify-start items-start space-y-3 pt-4">
            <DataStorageBanner className="rounded-lg bg-white border py-2 !justify-start" alwaysShow={true} />
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Database Type</label>
              <select
                className="select select-bordered w-full"
                value={connection.engineType}
                onChange={(e) => setPartialConnection({ engineType: e.target.value as Engine })}
              >
                <option value={Engine.MySQL}>MySQL</option>
                <option value={Engine.PostgreSQL}>PostgreSQL</option>
              </select>
            </div>
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
              <input
                type="text"
                placeholder="Connect host"
                className="input input-bordered w-full"
                value={connection.host}
                onChange={(e) => setPartialConnection({ host: e.target.value })}
              />
            </div>
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="text"
                placeholder="Connect port"
                className="input input-bordered w-full"
                value={connection.port}
                onChange={(e) => setPartialConnection({ port: e.target.value })}
              />
            </div>
            {showDatabaseField && (
              <div className="w-full flex flex-col">
                <label className="block text-sm font-medium text-gray-700 mb-1">Database Name</label>
                <input
                  type="text"
                  placeholder="Connect database"
                  className="input input-bordered w-full"
                  value={connection.database}
                  onChange={(e) => setPartialConnection({ database: e.target.value })}
                />
              </div>
            )}
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                placeholder="Connect username"
                className="input input-bordered w-full"
                value={connection.username}
                onChange={(e) => setPartialConnection({ username: e.target.value })}
              />
            </div>
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="text"
                placeholder="Connect password"
                className="input input-bordered w-full"
                value={connection.password}
                onChange={(e) => setPartialConnection({ password: e.target.value })}
              />
            </div>
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">SSL</label>
              <div className="w-full flex flex-row justify-start items-start flex-wrap">
                {SSLTypeOptions.map((option) => (
                  <label key={option.value} className="w-auto flex flex-row justify-start items-center cursor-pointer mr-3 mb-2">
                    <input
                      type="radio"
                      className="radio w-4 h-4 mr-1"
                      value={option.value}
                      checked={sslType === option.value}
                      onChange={(e) => setSSLType(e.target.value as SSLType)}
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
              {sslType !== "none" && (
                <>
                  <div className="text-sm space-x-3 mb-2">
                    <span
                      className={`leading-6 pb-1 border-b-2 border-transparent cursor-pointer opacity-60 hover:opacity-80 ${
                        selectedSSLField === "ca" && "!border-indigo-600 !opacity-100"
                      } `}
                      onClick={() => setSelectedSSLField("ca")}
                    >
                      CA Certificate
                    </span>
                    {sslType === "full" && (
                      <>
                        <span
                          className={`leading-6 pb-1 border-b-2 border-transparent cursor-pointer opacity-60 hover:opacity-80 ${
                            selectedSSLField === "key" && "!border-indigo-600 !opacity-100"
                          }`}
                          onClick={() => setSelectedSSLField("key")}
                        >
                          Client Key
                        </span>
                        <span
                          className={`leading-6 pb-1 border-b-2 border-transparent cursor-pointer opacity-60 hover:opacity-80 ${
                            selectedSSLField === "cert" && "!border-indigo-600 !opacity-100"
                          }`}
                          onClick={() => setSelectedSSLField("cert")}
                        >
                          Client Certificate
                        </span>
                      </>
                    )}
                  </div>
                  <div className="w-full h-auto relative">
                    <TextareaAutosize
                      className="w-full border resize-none rounded-lg text-sm p-3"
                      minRows={3}
                      maxRows={3}
                      value={(connection.ssl && connection.ssl[selectedSSLField]) ?? ""}
                      onChange={handleSSLValueChange}
                    />
                    <div
                      className={`${
                        connection.ssl && connection.ssl[selectedSSLField] && "hidden"
                      } absolute top-3 left-4 text-gray-400 text-sm leading-6 pointer-events-none`}
                    >
                      <span className="">Input or </span>
                      <label className="pointer-events-auto border border-dashed px-2 py-1 rounded-lg cursor-pointer hover:border-gray-600 hover:text-gray-600">
                        upload file
                        <input className="hidden" type="file" onChange={handleSSLFileInputChange} />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="modal-action w-full flex flex-row justify-between items-center space-x-2">
            <div>
              {isEditing && (
                <button className="btn btn-ghost" onClick={() => setShowDeleteConnectionModal(true)}>
                  Delete
                </button>
              )}
            </div>
            <div className="space-x-2 flex flex-row justify-center">
              <button className="btn btn-outline" onClick={close}>
                Close
              </button>
              <button className="btn" disabled={isRequesting || !allowSave} onClick={handleCreateConnection}>
                {isRequesting && <Icon.BiLoaderAlt className="w-4 h-auto animate-spin mr-1" />}
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConnectionModal &&
        createPortal(
          <ActionConfirmModal
            title="Delete Connection"
            content="Are you sure you want to delete this connection?"
            confirmButtonStyle="btn-error"
            close={() => setShowDeleteConnectionModal(false)}
            confirm={() => handleDeleteConnection()}
          />,
          document.body
        )}
    </>
  );
};

export default CreateConnectionModal;
